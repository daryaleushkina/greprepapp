import Foundation

/// Очередь и правки сериализованы actor; запросы могут приостанавливаться, поэтому каждое подтверждение
/// сверяется с поколением входа и с самим ответом, который ушёл в запросе.
actor TrainingRepository {
    typealias Report = @Sendable (String, String?) -> Void
    typealias Publish = @MainActor @Sendable ([String: StoredTraining], Int) async -> Void
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
    private var storageAvailable = false
    private var syncWaiters: [CheckedContinuation<Void, Never>] = []
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
        storageAvailable = false
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
                    // Владелец не проверен: даже совпавший id в файлах не разрешает показать прошлую очередь.
                    try access.withCurrent(revision) {
                        let lost = all.values.reduce(0) { $0 + $1.unsent.count }
                        let lostReports = all.values.reduce(0) { $0 + ($1.reports ?? []).count }
                        all = [:]
                        ownerID = nil
                        clearPending = true
                        report("training account changed: lost \(lost) unsent answers", nil)
                        report("training account changed: lost \(lostReports) unsent reports", nil)
                        try store.clear()
                        clearPending = false
                    }
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
            if let ownerID {
                try access.withCurrent(revision) {
                    try store.reconcileReportDrafts(ownerID: ownerID, trainings: all) { report($0, nil) }
                    for id in Array(all.keys) where all[id]?.reportDrafts != nil {
                        all[id]?.reportDrafts = nil
                        if let training = all[id] { try store.save(training) }
                    }
                }
            }
            storageAvailable = true
            await notify()
            // Подключение ждёт только диск и владельца: очередь не задерживает форму и локальные ответы.
            Task { await sync() }
        } catch {
            guard access.isCurrent(revision) else { return }
            if let failure = error as? APIFailure {
                // Диск прочитан; отсутствие сети при проверке владельца не делает хранилище неисправным.
                storageAvailable = true
                await handle(failure, what: "owner", epoch: revision)
            } else {
                storageAvailable = false
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
        guard storageAvailable else { throw .unexpected("training storage unavailable") }
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
            guard storageAvailable else { throw APIFailure.unexpected("training storage unavailable") }
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

    func recordReport(_ id: String, position: Int, draft: QuestionReportDraft, epoch: Int) async throws(APIFailure) {
        guard var t = current(id, epoch), (0..<t.total).contains(position) else { throw .cancelled }
        guard draft.canSend, let kind = draft.kind else { throw .unexpected("question report invalid input") }
        let text = draft.text.trimmingCharacters(in: .whitespacesAndNewlines)
        var pending = t.reports ?? []
        pending.append(
            .init(
                id: UUID(), position: position,
                body: .init(kind: kind, text: text.isEmpty ? nil : text, trainingId: id)))
        t.reports = pending
        do {
            let saved = try access.withCurrent(epoch) {
                try store.saveReport(t, position: position) {
                    report("question report draft cleanup failed: \($0)", nil)
                }
            }
            guard let saved else { throw APIFailure.cancelled }
            all[id] = saved
        } catch {
            if (error as? APIFailure) == .cancelled { throw .cancelled }
            reportStorage(error)
            throw .unexpected("question report storage failed")
        }
        await notify()
        Task { await sync() }
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
                let lostReports = all.values.filter { $0.ownerID != id }.reduce(0) { $0 + ($1.reports ?? []).count }
                // Отозвать память до удаления: отказ файловой системы не открывает старые данные новому входу.
                all = [:]
                ownerID = nil
                clearPending = true
                if changed {
                    report("training account changed: lost \(lost) unsent answers", nil)
                    report("training account changed: lost \(lostReports) unsent reports", nil)
                }
                try store.clear()
                clearPending = false
            }
            try store.saveOwner(id, credentialID: credentialID)
            ownerID = id
            storageAvailable = true
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
            await withCheckedContinuation { syncWaiters.append($0) }
            return
        }
        syncing = true
        defer {
            syncing = false
            let waiters = syncWaiters
            syncWaiters = []
            for waiter in waiters { waiter.resume() }
        }
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
        guard let ownerID, storageAvailable else { return }
        // После каждого await могла прийти правка. Из снимка берём только id, содержимое читаем заново.
        let ids = all.values.filter { $0.ownerID == ownerID && !$0.isFinished }.map(\.id)
        for id in ids {
            guard var t = current(id, epoch), !t.isFinished else { continue }
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
            // Жалоба независима от ответов: временный отказ одного запроса не держит остальные.
            for pendingReport in t.reports ?? [] {
                guard let fresh = current(t.id, epoch), (fresh.reports ?? []).contains(pendingReport) else { continue }
                let sent = await send(epoch: epoch, what: "question report") {
                    try await api.reportQuestion(
                        fresh.session.items[pendingReport.position].question.id, report: pendingReport.body)
                }
                if sent == .stop { return }
                if sent == .done || sent == .rejected, var latest = current(t.id, epoch) {
                    latest.reports = (latest.reports ?? []).filter { $0.id != pendingReport.id }
                    await persist(latest, epoch: epoch)
                }
            }
            if !t.unsent.isEmpty {
                let answers = t.unsent.sorted().compactMap { t.answers[$0] }
                if await sendAnswers(t.id, answers: answers, api: api, epoch: epoch) == .stop { return }
            }
            if var fresh = current(t.id, epoch), fresh.unsent.isEmpty, let finish = fresh.finish, !fresh.finishSent {
                let sent = await send(epoch: epoch, what: "finish") {
                    try await api.trainingFinish(t.id, finish: finish)
                }
                if sent == .stop { return }
                if sent == .done || sent == .rejected, let current = current(t.id, epoch) {
                    fresh = current
                    fresh.finishSent = true
                    await persist(fresh, epoch: epoch)
                }
            }
        }
        do { try prune(epoch: epoch) } catch { reportStorage(error) }
        await notify()
    }

    private func sendAnswers(_ id: String, answers: [GivenAnswer], api: API, epoch: Int) async -> Sent {
        let what = answers.count == 1 ? "answer at position \(answers[0].position)" : "answers"
        let sent = await send(epoch: epoch, what: what, reportRejection: answers.count == 1) {
            try await api.trainingAnswers(id, answers: answers)
        }
        if sent == .rejected && answers.count > 1 {
            // Пачка — транзакция: её отказ ничего не говорит об остальных ответах.
            for answer in answers {
                if await sendAnswers(id, answers: [answer], api: api, epoch: epoch) == .stop { return .stop }
            }
        } else if sent == .done || sent == .rejected, var fresh = current(id, epoch) {
            fresh.unsent = fresh.unsent.filter { fresh.answers[$0].map { !answers.contains($0) } ?? true }
            await persist(fresh, epoch: epoch)
        }
        return sent
    }

    private enum Sent { case done, rejected, later, stop }
    private func send(epoch: Int, what: String, reportRejection: Bool = true, request: () async throws -> Void) async
        -> Sent
    {
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
                if reportRejection { report("training \(what) rejected: \(code)", requestID) }
                return .rejected
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
            // Черновик не продлевает хранение тренировки (решение Даши 09.10.2026).
            let finished = all.values.filter { $0.isFinished && $0.isSynced }.sorted {
                $0.startedAtMillis > $1.startedAtMillis
            }
            let unfinished = all.values.filter { !$0.isFinished }.sorted { $0.startedAtMillis > $1.startedAtMillis }
            let removed =
                Array(finished.dropFirst(3)) + unfinished.dropFirst().filter { $0.isSynced }
            for t in removed {
                try store.remove(t.id)
                all[t.id] = nil
            }
            if let ownerID {
                try store.reconcileReportDrafts(ownerID: ownerID, trainings: all) { report($0, nil) }
            }
        }
    }

    private func reportStorage(_ error: any Error) {
        report("training storage failed: \(TrainingStore.reason(error))", nil)
    }
}
