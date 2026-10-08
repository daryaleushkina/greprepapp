import Foundation

/// Очередь и правки сериализованы actor; запросы могут приостанавливаться, поэтому каждое подтверждение
/// сверяется с поколением входа и с самим ответом, который ушёл в запросе.
actor TrainingRepository {
    typealias Report = @Sendable (String, String?) -> Void
    typealias Publish = @MainActor @Sendable ([String: StoredTraining], Int) -> Void
    private let store: TrainingStore
    nonisolated let access: TrainingAccess
    private let report: Report
    private let publish: Publish
    private let unauthorized: @MainActor @Sendable (Int) -> Void
    private let now: @Sendable () -> Date
    private var all: [String: StoredTraining] = [:]
    private var ownerID: String?
    private var credentialID: String?
    private var api: API?
    private var revision = 0
    private var loaded = false
    private var syncing = false
    private var syncAgain = false
    private var clearPending = false

    init(
        store: TrainingStore, access: TrainingAccess, now: @escaping @Sendable () -> Date = { Date() },
        report: @escaping Report, publish: @escaping Publish,
        unauthorized: @escaping @MainActor @Sendable (Int) -> Void
    ) {
        self.store = store
        self.access = access
        self.now = now
        self.report = report
        self.publish = publish
        self.unauthorized = unauthorized
    }

    func connect(
        api: API, ownerID knownOwner: String?, credentialID: String? = nil, clearPrevious: Bool = false,
        revision: Int
    ) async {
        guard access.isCurrent(revision) else { return }
        self.api = api
        self.revision = revision
        self.credentialID = credentialID
        do {
            if clearPrevious || store.requiresClear || clearPending {
                try access.withCurrent(revision) {
                    all = [:]
                    ownerID = nil
                    loaded = true
                    clearPending = true
                    try store.clear()
                    clearPending = false
                }
            }
            if !loaded {
                all = try store.load { report($0, nil) }
                loaded = true
                do { ownerID = try store.owner() } catch {
                    report("training owner unreadable: \(TrainingStore.reason(error))", nil)
                }
            }
            if let knownOwner {
                try selectOwner(knownOwner, revision: revision)
            } else if let credentialID, try store.credentialID() != credentialID {
                // Вход мог прерваться между записью токена и владельца. Чужие данные не показываем и не
                // отправляем, пока сервер не подтвердит, кому принадлежит именно этот токен.
                ownerID = nil
                if !all.isEmpty {
                    let user = try await api.me()
                    guard access.isCurrent(revision) else { return }
                    try selectOwner(user.id, revision: revision)
                }
            }
            await notify()
            await sync()
        } catch {
            if let failure = error as? APIFailure {
                await handle(failure, what: "owner", epoch: revision)
            } else {
                reportStorage(error)
            }
            await notify()
        }
    }

    func disconnect(clear: Bool, revision: Int) async {
        guard access.isCurrent(revision) else { return }
        self.revision = revision
        api = nil
        if clear {
            all = [:]
            ownerID = nil
            loaded = true
            clearPending = true
            do {
                try store.clear()
                clearPending = false
            } catch { reportStorage(error) }
        }
        await publish([:], revision)
    }

    func options(epoch: Int) async throws(APIFailure) -> TrainingOptions {
        guard let api, revision == epoch, access.isCurrent(epoch) else { throw .cancelled }
        do {
            let options = try await api.trainingOptions()
            guard access.isCurrent(epoch) else { throw APIFailure.cancelled }
            return options
        } catch {
            let failure = APIFailure(error)
            await handle(failure, what: "options", epoch: epoch)
            throw failure
        }
    }

    func start(_ request: TrainingRequest, epoch: Int) async throws(APIFailure) -> String {
        guard let api, revision == epoch, access.isCurrent(epoch) else { throw .cancelled }
        do {
            if ownerID == nil {
                let user = try await api.me()
                guard access.isCurrent(epoch) else { throw APIFailure.cancelled }
                try selectOwner(user.id, revision: epoch)
            }
            guard access.isCurrent(epoch), let ownerID else { throw APIFailure.cancelled }
            let session = try await api.startTraining(request)
            guard access.isCurrent(epoch) else { throw APIFailure.cancelled }
            let training = StoredTraining(
                ownerID: ownerID, session: session,
                startedAtMillis: Int64(now().timeIntervalSince1970 * 1000))
            // Не сохранилось — «Начать» не открывает сессию: обещание пережить перезапуск важнее перехода.
            try save(training, epoch: epoch)
            try prune(epoch: epoch)
            await notify()
            return training.id
        } catch {
            let failure: APIFailure
            if let apiFailure = error as? APIFailure {
                failure = apiFailure
            } else {
                reportStorage(error)
                failure = .unexpected("training start storage failed")
            }
            await handle(failure, what: "start", epoch: epoch)
            throw failure
        }
    }

    func answer(
        _ id: String, position: Int, optionIDs: [String], dontKnow: Bool = false,
        flagged: Bool = false, elapsedMs: Int = 0, epoch: Int
    ) async {
        guard var t = current(id, epoch), !t.isFinished, (0..<t.total).contains(position) else { return }
        t.answers[position] = GivenAnswer(
            position: position, optionIds: optionIDs, dontKnow: dontKnow,
            flagged: flagged, answeredAt: now(), elapsedMs: min(86_400_000, max(0, elapsedMs)))
        t.unsent.insert(position)
        await persist(t, epoch: epoch)
        Task { await sync() }
    }

    func move(_ id: String, position: Int, epoch: Int) async {
        guard var t = current(id, epoch), (0..<t.total).contains(position) else { return }
        t.position = position
        await persist(t, epoch: epoch)
    }

    func finish(_ id: String, timedOut: Bool, epoch: Int) async {
        guard var t = current(id, epoch), !t.isFinished else { return }
        t.finish = .init(finishedAt: now(), timedOut: timedOut)
        await persist(t, epoch: epoch)
        Task { await sync() }
    }

    private func current(_ id: String, _ epoch: Int) -> StoredTraining? {
        guard access.isCurrent(epoch), epoch == revision, api != nil, let t = all[id], t.ownerID == ownerID else {
            return nil
        }
        return t
    }

    private func save(_ training: StoredTraining, epoch: Int) throws {
        let saved = try access.withCurrent(epoch) {
            try store.save(training)
            all[training.id] = training
            return true
        }
        guard saved == true else { throw APIFailure.cancelled }
    }

    private func persist(_ training: StoredTraining, epoch: Int) async {
        do { try save(training, epoch: epoch) } catch {
            if (error as? APIFailure) == .cancelled { return }
            // В памяти ответ остаётся для следующей попытки записи; в очередь не подтверждаем его без диска.
            if access.isCurrent(epoch) { all[training.id] = training }
            reportStorage(error)
        }
        await notify()
    }

    private func selectOwner(_ id: String, revision: Int) throws {
        try access.withCurrent(revision) {
            let changed = ownerID.map({ $0 != id }) == true || all.values.contains(where: { $0.ownerID != id })
            if changed || clearPending {
                let lost = all.values.filter { $0.ownerID != id }.reduce(0) { $0 + $1.unsent.count }
                // Отозвать память до удаления: отказ файловой системы не открывает старые данные новому входу.
                all = [:]
                ownerID = nil
                clearPending = true
                if changed { report("training account changed: lost \(lost) unsent answers", nil) }
                try store.clear()
                clearPending = false
            }
            try store.saveOwner(id, credentialID: credentialID)
            ownerID = id
        }
    }

    private func notify() async {
        let visible = api == nil ? [:] : all.filter { $0.value.ownerID == ownerID }
        await publish(visible, revision)
    }

    /// Повторный повод во время отправки требует ещё одного круга, а не параллельного запроса.
    func sync() async {
        if syncing {
            syncAgain = true
            return
        }
        syncing = true
        defer { syncing = false }
        repeat {
            syncAgain = false
            await syncOnce()
        } while syncAgain
    }

    private func syncOnce() async {
        guard let api, access.isCurrent(revision) else { return }
        let epoch = revision
        if ownerID == nil && !all.isEmpty {
            do {
                let user = try await api.me()
                guard access.isCurrent(epoch) else { return }
                try selectOwner(user.id, revision: epoch)
            } catch {
                if let failure = error as? APIFailure {
                    await handle(failure, what: "owner", epoch: epoch)
                } else {
                    reportStorage(error)
                }
                await notify()
                return
            }
        }
        guard let ownerID else { return }
        for var t in all.values where t.ownerID == ownerID && !t.isFinished {
            if TrainingRules.remainingSeconds(t, nowMillis: Int64(now().timeIntervalSince1970 * 1000)) == 0,
                let limit = t.session.timeLimitSeconds
            {
                t.finish = .init(
                    finishedAt: Date(timeIntervalSince1970: Double(t.startedAtMillis) / 1000 + Double(limit)),
                    timedOut: true)
                await persist(t, epoch: epoch)
            }
        }
        let pending = all.values.filter { $0.ownerID == ownerID }.sorted { $0.startedAtMillis < $1.startedAtMillis }
        for t in pending {
            guard access.isCurrent(epoch) else { return }
            if !t.unsent.isEmpty {
                let answers = t.unsent.sorted().compactMap { t.answers[$0] }
                let sent = await send(epoch: epoch, what: "answers") {
                    try await api.trainingAnswers(t.id, answers: answers)
                }
                switch sent {
                case .stop: return
                case .later: continue
                case .done:
                    if var fresh = current(t.id, epoch) {
                        fresh.unsent = fresh.unsent.filter { fresh.answers[$0].map { !answers.contains($0) } ?? true }
                        await persist(fresh, epoch: epoch)
                    }
                }
            }
            if var fresh = current(t.id, epoch), fresh.unsent.isEmpty, let finish = fresh.finish, !fresh.finishSent {
                let sent = await send(epoch: epoch, what: "finish") {
                    try await api.trainingFinish(t.id, finish: finish)
                }
                if sent == .stop { return }
                if sent == .done, let current = current(t.id, epoch) {
                    fresh = current
                    fresh.finishSent = true
                    await persist(fresh, epoch: epoch)
                }
            }
        }
        do { try prune(epoch: epoch) } catch { reportStorage(error) }
        await notify()
    }

    private enum Sent { case done, later, stop }
    private func send(epoch: Int, what: String, request: () async throws -> Void) async -> Sent {
        do {
            try await request()
            return access.isCurrent(epoch) ? .done : .stop
        } catch {
            guard access.isCurrent(epoch) else { return .stop }
            let failure = APIFailure(error)
            await handle(failure, what: what, epoch: epoch)
            switch failure {
            case .offline, .unauthorized, .cancelled: return .stop
            case let .server(status, code, requestID) where [400, 404, 409, 410, 422].contains(status):
                report("training \(what) rejected: \(code)", requestID)
                return .done
            default: return .later
            }
        }
    }

    private func handle(_ failure: APIFailure, what: String, epoch: Int) async {
        guard access.isCurrent(epoch) else { return }
        if failure == .unauthorized {
            await unauthorized(epoch)
        } else if failure.isReportable {
            report("training \(what): \(failure)", failure.requestID)
        }
    }

    private func prune(epoch: Int) throws {
        try access.withCurrent(epoch) {
            let finished = all.values.filter { $0.isFinished && $0.isSynced }.sorted {
                $0.startedAtMillis > $1.startedAtMillis
            }
            let unfinished = all.values.filter { !$0.isFinished }.sorted { $0.startedAtMillis > $1.startedAtMillis }
            let removed = Array(finished.dropFirst(3)) + unfinished.dropFirst().filter { $0.unsent.isEmpty }
            for t in removed {
                try store.remove(t.id)
                all[t.id] = nil
            }
        }
    }

    private func reportStorage(_ error: any Error) {
        report("training storage failed: \(TrainingStore.reason(error))", nil)
    }
}
