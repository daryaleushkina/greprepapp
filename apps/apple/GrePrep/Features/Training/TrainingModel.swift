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
        }
    }

    func disconnect(clear: Bool) {
        if clear { needsClear = true }
        revision = access.renew()
        if clear {
            do { try store.markClear() } catch {
                report("training clear marker failed: \(TrainingStore.reason(error))", nil)
            }
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
        _ id: String, position: Int, draft: QuestionReportDraft?, epoch: Int
    ) throws(APIFailure) {
        guard epoch == revision, let t = trainings[id], (0..<t.total).contains(position) else { throw .cancelled }
        do {
            let saved = try access.withCurrentDraft(epoch) {
                try store.saveReportDraft(id, position: position, draft: draft, ownerID: t.ownerID)
                return true
            }
            guard saved == true else { throw APIFailure.cancelled }
        } catch {
            if (error as? APIFailure) == .cancelled || (error as? TrainingStorageError) == .missingTraining {
                throw .cancelled
            }
            report("question report draft storage failed: \(TrainingStore.reason(error))", nil)
            throw .unexpected("question report draft storage failed")
        }
    }

    func recordReport(
        _ id: String, position: Int, draft: QuestionReportDraft,
        completion: @escaping @MainActor @Sendable (APIFailure?) -> Void
    ) {
        let epoch = revision
        let repository = repository
        enqueue {
            do {
                try await repository.recordReport(id, position: position, draft: draft, epoch: epoch)
                await completion(nil)
            } catch { await completion(APIFailure(error)) }
        }
    }
    func reportDraft(_ id: String, position: Int) -> QuestionReportDraft {
        guard let t = trainings[id], (0..<t.total).contains(position) else { return .init() }
        do {
            return try access.withCurrentDraft(revision) {
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
