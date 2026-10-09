import Foundation
import Observation

/// Снимок actor для SwiftUI. Действия принадлежат приложению: уход со страницы не отменяет запись.
@MainActor
@Observable
final class TrainingModel {
    private(set) var trainings: [String: StoredTraining] = [:]
    @ObservationIgnored let access = TrainingAccess()
    @ObservationIgnored private let store: TrainingStore
    @ObservationIgnored private let report: TrainingRepository.Report
    @ObservationIgnored var onUnauthorized: @MainActor @Sendable () -> Void
    @ObservationIgnored private let now: @Sendable () -> Date
    @ObservationIgnored private var connection: Task<Void, Never>?
    @ObservationIgnored private var edits: Task<Void, Never>?
    @ObservationIgnored private var needsClear = false
    @ObservationIgnored private var draftChanges: [ReportDraftKey: ReportDraftWrite] = [:]
    @ObservationIgnored private var draftCompletions: [ReportDraftKey: @MainActor @Sendable (APIFailure?) -> Void] = [:]
    @ObservationIgnored private var draftDelay: Task<Void, Never>?
    @ObservationIgnored private var draftFlush: Task<Void, Never>?
    @ObservationIgnored private lazy var draftWriter = ReportDraftWriter(store: store, access: access, report: report)
    // Задержка записи ввода, не длительность анимации. При закрытии и фоне ожидания нет.
    private static let draftDebounce: Duration = .milliseconds(300)
    private(set) var revision = 0
    var reviewClosed = false

    @ObservationIgnored lazy var repository = TrainingRepository(
        store: store, access: access, now: now, report: report,
        publish: { [weak self] all, epoch in
            guard let self, self.revision == epoch else { return }
            self.trainings = all
        },
        unauthorized: { [weak self] epoch in
            guard let self, self.revision == epoch else { return }
            self.onUnauthorized()
        })

    init(
        store: TrainingStore, now: @escaping @Sendable () -> Date = { Date() },
        report: @escaping TrainingRepository.Report, unauthorized: @escaping @MainActor @Sendable () -> Void
    ) {
        self.store = store
        self.now = now
        self.report = report
        self.onUnauthorized = unauthorized
    }

    var active: StoredTraining? {
        trainings.values.filter {
            !$0.isFinished
                && TrainingRules.remainingSeconds(
                    $0,
                    nowMillis: Int64(now().timeIntervalSince1970 * 1000)) != 0
        }.max { $0.startedAtMillis < $1.startedAtMillis }
    }

    var currentDate: Date { now() }

    func connect(api: API, ownerID: String?, credentialID: String? = nil) {
        revision = access.renew()
        let epoch = revision
        let repository = repository
        let clearPrevious = needsClear
        needsClear = false
        connection = Task {
            await repository.connect(
                api: api, ownerID: ownerID, credentialID: credentialID,
                clearPrevious: clearPrevious, revision: epoch)
            guard revision == epoch else { return }
            draftChanges = draftChanges.filter { trainings[$0.key.id]?.ownerID == $0.value.ownerID }
            rebaseDrafts(epoch)
            if !draftChanges.isEmpty { await flushReportDrafts() }
        }
    }

    func disconnect(clear: Bool) {
        if clear { needsClear = true }
        revision = access.renew()
        if clear {
            draftDelay?.cancel()
            draftChanges = [:]
            draftCompletions = [:]
            do { try store.markClear() } catch {
                report("training clear marker failed: \(TrainingStore.reason(error))", nil)
            }
        }
        if !clear {
            rebaseDrafts(revision)
            _ = beginDraftFlush()
        }
        trainings = [:]
        let repository = repository
        let epoch = revision
        connection = Task { await repository.disconnect(clear: clear, revision: epoch) }
    }

    func sync() {
        let connection = connection
        let repository = repository
        Task {
            await connection?.value
            await repository.sync()
        }
    }

    func options() async throws(APIFailure) -> TrainingOptions {
        let epoch = revision
        await connection?.value
        guard revision == epoch else { throw .cancelled }
        return try await repository.options(epoch: epoch)
    }

    func start(_ request: TrainingRequest) async throws(APIFailure) -> String {
        let epoch = revision
        await connection?.value
        guard revision == epoch else { throw .cancelled }
        return try await repository.start(request, epoch: epoch)
    }

    func recordAnswer(
        _ id: String, position: Int, optionIDs: [String], dontKnow: Bool = false,
        flagged: Bool = false, elapsedMs: Int = 0
    ) {
        let epoch = revision
        let repository = repository
        enqueue {
            await repository.answer(
                id, position: position, optionIDs: optionIDs, dontKnow: dontKnow,
                flagged: flagged, elapsedMs: elapsedMs, epoch: epoch)
        }
    }

    func recordPosition(_ id: String, position: Int) {
        let epoch = revision
        let repository = repository
        enqueue { await repository.move(id, position: position, epoch: epoch) }
    }

    func recordFinish(_ id: String, timedOut: Bool) {
        let epoch = revision
        let repository = repository
        enqueue { await repository.finish(id, timedOut: timedOut, epoch: epoch) }
    }

    func saveReportDraft(
        _ id: String, position: Int, draft: QuestionReportDraft?, epoch: Int,
        completion: @escaping @MainActor @Sendable (APIFailure?) -> Void = { _ in }
    ) throws(APIFailure) {
        guard epoch == revision, let t = trainings[id], (0..<t.total).contains(position) else { throw .cancelled }
        let key = ReportDraftKey(id: id, position: position)
        draftChanges[key] = .init(key: key, ownerID: t.ownerID, epoch: epoch, version: UUID(), draft: draft)
        draftCompletions[key] = completion
        draftDelay?.cancel()
        draftDelay = Task {
            do { try await Task.sleep(for: Self.draftDebounce) } catch is CancellationError { return } catch {
                report("question report draft delay failed: \(TrainingStore.reason(error))", nil)
            }
            await flushReportDrafts()
        }
    }

    private func rebaseDrafts(_ epoch: Int) {
        draftChanges = draftChanges.mapValues {
            .init(key: $0.key, ownerID: $0.ownerID, epoch: epoch, version: $0.version, draft: $0.draft)
        }
    }
    func flushReportDrafts() async { await beginDraftFlush().value }
    private func beginDraftFlush() -> Task<Void, Never> {
        draftDelay?.cancel()
        draftDelay = nil
        let previous = draftFlush
        let writer = draftWriter
        let task = Task {
            await previous?.value
            let batch = Array(draftChanges.values)
            guard !batch.isEmpty else { return }
            let failures = await writer.write(batch)
            for change in batch
            where draftChanges[change.key]?.version == change.version && draftChanges[change.key]?.epoch == change.epoch
            {
                let completion = draftCompletions[change.key]
                if failures[change.key] == nil || failures[change.key] == .cancelled {
                    draftChanges[change.key] = nil
                    draftCompletions[change.key] = nil
                }
                completion?(failures[change.key])
            }
        }
        draftFlush = task
        return task
    }

    func recordReport(
        _ id: String, position: Int, draft: QuestionReportDraft,
        completion: @escaping @MainActor @Sendable (APIFailure?) -> Void
    ) {
        let epoch = revision
        let repository = repository
        let flushed = beginDraftFlush()
        let key = ReportDraftKey(id: id, position: position)
        let version = draftChanges[key]?.version
        enqueue {
            await flushed.value
            do {
                try await repository.recordReport(id, position: position, draft: draft, epoch: epoch)
                await self.reportRecorded(key, version: version, epoch: epoch)
                await completion(nil)
            } catch { await completion(APIFailure(error)) }
        }
    }
    private func reportRecorded(_ key: ReportDraftKey, version: UUID?, epoch: Int) {
        guard revision == epoch, draftChanges[key]?.version == version else { return }
        draftChanges[key] = nil
        draftCompletions[key] = nil
    }

    func reportDraft(_ id: String, position: Int) -> QuestionReportDraft {
        guard let t = trainings[id], (0..<t.total).contains(position) else { return .init() }
        do {
            return try access.withCurrent(revision) {
                let key = ReportDraftKey(id: id, position: position)
                if let changed = draftChanges[key], changed.ownerID == t.ownerID { return changed.draft ?? .init() }
                return try store.reportDraft(
                    id, position: position, ownerID: t.ownerID, consumed: t.reportDraftClearances?[position]) ?? .init()
            } ?? .init()
        } catch {
            report("question report draft unreadable: \(TrainingStore.reason(error))", nil)
            return .init()
        }
    }

    func closeMissingReview(_ id: String, epoch: Int) -> Bool {
        guard revision == epoch, trainings[id] == nil else { return false }
        reviewClosed = true
        return true
    }

    private func enqueue(_ action: @escaping @Sendable () async -> Void) {
        let previous = edits
        let connection = connection
        edits = Task {
            await connection?.value
            await previous?.value
            await action()
        }
    }
}
