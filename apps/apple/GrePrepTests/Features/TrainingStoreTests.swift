import Foundation
import Testing

@testable import GrePrep

final class TrainingWriteBarrier: @unchecked Sendable {
    private let lock = NSLock()
    private let resume = DispatchSemaphore(value: 0)
    let draftFinished = DispatchSemaphore(value: 0)
    private var armed = false
    private var didStart = false
    private var didRelease = false
    var started: Bool { lock.withLock { didStart } }
    var released: Bool { lock.withLock { didRelease } }
    func arm() { lock.withLock { armed = true } }
    func blockIfArmed() {
        let block = lock.withLock {
            guard armed else { return false }
            armed = false
            didStart = true
            return true
        }
        if block { resume.wait() }
    }
    func release() {
        lock.withLock {
            guard !didRelease else { return }
            didRelease = true
            resume.signal()
        }
    }
}

@Suite("Тренировки на диске")
struct TrainingStoreTests {
    let store = temporaryTrainingStore()

    @Test func draftFileDoesNotShareTrainingWriteLock() async throws {
        let barrier = TrainingWriteBarrier()
        let completed = Reports()
        let storage = TrainingStore(directory: store.directory, onTrainingWrite: { barrier.blockIfArmed() })
        let t = TrainingFixture.stored()
        try storage.saveOwner(t.ownerID)
        try storage.save(t)
        barrier.arm()
        defer { barrier.release() }
        let trainingWrite = Task.detached { try storage.save(t) }
        await eventually { barrier.started }
        let draftWrite = Task.detached {
            try storage.saveReportDraft(t.id, position: 0, draft: .init(kind: .other, text: "x"), ownerID: t.ownerID)
            completed.add("written")
        }
        await eventually { completed.messages == ["written"] }
        #expect(!barrier.released)
        barrier.release()
        try await trainingWrite.value
        try await draftWrite.value
    }

    @Test func reportCommitKeepsDraftEditedDuringTrainingWrite() async throws {
        let barrier = TrainingWriteBarrier()
        let completed = Reports()
        let storage = TrainingStore(directory: store.directory, onTrainingWrite: { barrier.blockIfArmed() })
        var t = TrainingFixture.stored()
        try storage.saveOwner(t.ownerID)
        try storage.save(t)
        try storage.saveReportDraft(t.id, position: 0, draft: .init(kind: .other, text: "x"), ownerID: t.ownerID)
        t.reports = [.init(id: UUID(), position: 0, body: .init(kind: .other, text: "x", trainingId: t.id))]
        let submitted = t
        barrier.arm()
        defer { barrier.release() }
        let commit = Task.detached {
            try storage.saveReport(submitted, position: 0) { _ in Issue.record("сбой удаления") }
        }
        await eventually { barrier.started }
        let edit = Task.detached {
            try storage.saveReportDraft(
                submitted.id, position: 0, draft: .init(kind: .answer), ownerID: submitted.ownerID)
            completed.add("written")
        }
        await eventually { completed.messages == ["written"] }
        barrier.release()
        try await edit.value
        let saved = try await commit.value
        #expect(saved.reports?.count == 1 && saved.reportDraftClearances?[t.position] != nil)
        let cold = TrainingStore(directory: storage.directory)
        try cold.reconcileReportDrafts(ownerID: t.ownerID, trainings: [t.id: saved]) { _ in
            Issue.record("повреждён файл")
        }
        #expect(try cold.reportDraft(t.id, position: 0, ownerID: t.ownerID)?.kind == .answer)
    }

    private struct DraftFile: Codable {
        let ownerID: String
        var questions: [String: [Int: QuestionReportDraft]]
    }

    @Test func clearMarkerRevokesCachedDraftImmediately() throws {
        let t = TrainingFixture.stored()
        try store.saveOwner(t.ownerID)
        try store.save(t)
        try store.saveReportDraft(t.id, position: 0, draft: .init(kind: .other, text: "x"), ownerID: t.ownerID)
        try store.markClear()
        #expect(throws: TrainingStorageError.self) { try store.reportDraft(t.id, position: 0, ownerID: t.ownerID) }
    }

    @Test func cachedDraftStillChecksOwner() throws {
        let t = TrainingFixture.stored()
        try store.saveOwner(t.ownerID)
        try store.save(t)
        try store.saveReportDraft(t.id, position: 0, draft: .init(kind: .other, text: "x"), ownerID: t.ownerID)
        try TrainingStore(directory: store.directory).saveOwner("other")
        #expect(throws: TrainingStorageError.self) { try store.reportDraft(t.id, position: 0, ownerID: t.ownerID) }
    }

    @Test("Ожидающее стирание и чужой владелец не портят исправный файл", arguments: [false, true])
    func draftContextFailureDoesNotQuarantine(clear: Bool) throws {
        let t = TrainingFixture.stored()
        try store.saveOwner(t.ownerID)
        try store.save(t)
        try store.saveReportDraft(t.id, position: 0, draft: .init(kind: .other, text: "x"), ownerID: t.ownerID)
        let file = store.directory.appending(path: "report-drafts.json")
        let before = try Data(contentsOf: file)
        if clear { try store.markClear() }
        let cold = TrainingStore(directory: store.directory)
        #expect(throws: TrainingStorageError.self) {
            try cold.reconcileReportDrafts(ownerID: clear ? t.ownerID : "other", trainings: [t.id: t]) { _ in }
        }
        #expect(try Data(contentsOf: file) == before)
        #expect(
            try FileManager.default.contentsOfDirectory(atPath: store.directory.path).allSatisfy {
                !$0.hasSuffix(".broken")
            })
    }

    @Test func separateDraftSurvivesRelaunchWithoutChangingTraining() throws {
        let t = TrainingFixture.stored()
        let draft = QuestionReportDraft(kind: .translation, text: "x")
        try store.saveOwner(t.ownerID)
        try store.save(t)
        try store.saveReportDraft(t.id, position: 0, draft: draft, ownerID: t.ownerID)
        let cold = TrainingStore(directory: store.directory)
        #expect(try cold.reportDraft(t.id, position: 0, ownerID: t.ownerID) == draft)
        #expect(try cold.load { _ in }[t.id] == t)
        #expect(throws: TrainingStorageError.self) { try cold.reportDraft(t.id, position: 0, ownerID: "other") }
        #expect(throws: TrainingStorageError.self) {
            try store.saveReportDraft("../other", position: 0, draft: draft, ownerID: t.ownerID)
        }
        #expect(throws: TrainingStorageError.self) {
            try store.saveReportDraft(t.id, position: -1, draft: draft, ownerID: t.ownerID)
        }
        try store.saveReportDraft(t.id, position: 0, draft: nil, ownerID: t.ownerID)
        #expect(!FileManager.default.fileExists(atPath: store.directory.appending(path: "report-drafts.json").path))
        try store.clear()
        try store.saveOwner("other")
        #expect(try store.reportDraft(t.id, position: 0, ownerID: "other") == nil)
    }

    @Test func draftReconciliationRemovesOrphansAndKeepsNewerDraft() throws {
        var t = TrainingFixture.stored()
        t.reportDrafts = [0: .init(kind: .question, text: "old")]
        try store.saveOwner(t.ownerID)
        try store.save(t)
        let draft = QuestionReportDraft(kind: .answer, text: "new")
        let data = DraftFile(
            ownerID: t.ownerID,
            questions: [
                t.id: [0: draft, t.total: draft, 1: .init()],
                "00000000-0000-4000-8000-000000000999": [0: draft],
            ])
        try JSONEncoder().encode(data).write(to: store.directory.appending(path: "report-drafts.json"))
        try store.reconcileReportDrafts(ownerID: t.ownerID, trainings: [t.id: t]) { _ in Issue.record("повреждён файл")
        }
        #expect(try store.reportDraft(t.id, position: 0, ownerID: t.ownerID) == draft)
        #expect(try store.reportDraft(t.id, position: t.total, ownerID: t.ownerID) == nil)
        #expect(try store.reportDraft(t.id, position: 1, ownerID: t.ownerID) == nil)
        try store.reconcileReportDrafts(ownerID: t.ownerID, trainings: [:]) { _ in Issue.record("повреждён файл") }
        #expect(try store.reportDraft(t.id, position: 0, ownerID: t.ownerID) == nil)
    }

    @Test("Нечитаемые черновики изолируются без текста")
    func damagedDraftIsQuarantinedWithoutText() throws {
        let t = TrainingFixture.stored()
        try store.saveOwner(t.ownerID)
        try store.save(t)
        let bytes = Data("private-test-marker".utf8)
        try bytes.write(to: store.directory.appending(path: "report-drafts.json"))
        var messages: [String] = []
        try store.reconcileReportDrafts(ownerID: t.ownerID, trainings: [t.id: t]) { messages.append($0) }
        #expect(messages.count == 1 && messages.allSatisfy { !$0.contains("private-test-marker") })
        #expect(try store.load { _ in }[t.id] == t)
        #expect(try store.reportDraft(t.id, position: 0, ownerID: t.ownerID) == nil)
        let files = try FileManager.default.contentsOfDirectory(at: store.directory, includingPropertiesForKeys: nil)
        #expect(files.contains { $0.pathExtension == "broken" })
    }

    @Test func survivesRelaunchAndExcludesBackup() throws {
        let t = TrainingFixture.stored(pending: true, finished: true)
        try store.saveOwner(t.ownerID)
        try store.save(t)
        let restored = try TrainingStore(directory: store.directory).load { _ in Issue.record("нечитаемый файл") }
        #expect(restored[t.id] == t)
        #expect(try store.owner() == "person")
        #expect(try store.directory.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        try store.remove(t.id)
        #expect(try store.load { _ in }.isEmpty)
        try store.remove(t.id)
        try store.clear()
        try store.clear()
        #expect(try store.owner() == nil)
    }

    @Test func liveFactoryAndDirectoryAfterAccountClear() throws {
        let cache = temporaryCache()
        let store = TrainingStore.live(beside: cache)
        #expect(store.directory == cache.fileURL.deletingLastPathComponent().appending(path: "trainings"))
        try store.saveOwner("first")
        try store.clear()
        try store.saveOwner("second")
        #expect(try store.owner() == "second")
        #expect(try store.directory.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
    }

    @Test func corruptFileIsKeptAside() throws {
        try store.save(TrainingFixture.stored())
        let file = store.directory.appending(path: TrainingFixture.session.id + ".training.json")
        try Data("not json".utf8).write(to: file)
        var reports: [String] = []
        #expect(try store.load { reports.append($0) }.isEmpty)
        #expect(reports.count == 1)
        let files = try FileManager.default.contentsOfDirectory(at: store.directory, includingPropertiesForKeys: nil)
        #expect(files.count == 1 && files[0].pathExtension == "broken")
        #expect(try Data(contentsOf: files[0]) == Data("not json".utf8))
        #expect(try store.load { _ in Issue.record("повторный отчёт") }.isEmpty)
    }

    @Test func invalidPositionsAreQuarantined() throws {
        var t = TrainingFixture.stored()
        t.position = t.total
        try store.save(t)
        #expect(try store.load { _ in }.isEmpty)
    }

    @Test func emptyStoreAndInvalidID() throws {
        #expect(try store.load { _ in }.isEmpty)
        #expect(throws: TrainingStorageError.self) { try store.save(TrainingFixture.stored(id: "../other")) }
        #expect(throws: TrainingStorageError.self) { try store.remove("../other") }
    }

    @Test func failedWriteDoesNotReplaceLastFile() throws {
        let t = TrainingFixture.stored()
        try store.save(t)
        let impossible = TrainingStore(directory: store.directory.appending(path: t.id + ".training.json"))
        #expect(throws: (any Error).self) { try impossible.save(t) }
        #expect(try store.load { _ in }[t.id] == t)
    }

    @Test func interruptedSignOutCannotRestoreFiles() throws {
        try store.markClear()
        #expect(!store.requiresClear)
        let t = TrainingFixture.stored(pending: true)
        try store.saveOwner(t.ownerID)
        try store.save(t)
        try store.markClear()
        let restored = TrainingStore(directory: store.directory)
        #expect(restored.requiresClear)
        #expect(try restored.load { _ in }.isEmpty)
        #expect(try restored.owner() == nil)
    }
    @Test("Повреждённая цель жалобы изолируется без текста", arguments: [false, true])
    func invalidReportTargetIsQuarantined(draft: Bool) throws {
        var t = TrainingFixture.stored()
        if draft {
            t.reportDrafts = [t.total: .init(kind: .other, text: "private-test-marker")]
        } else {
            t.reports = [
                .init(
                    id: UUID(), position: t.total,
                    body: .init(kind: .other, text: "private-test-marker", trainingId: t.id))
            ]
        }
        try store.save(t)
        var reports: [String] = []
        #expect(try store.load { reports.append($0) }.isEmpty)
        #expect(reports.count == 1)
        #expect(reports.allSatisfy { !$0.contains("private-test-marker") })
    }

    @Test func filesBeforeReportsRemainReadable() throws {
        let t = TrainingFixture.stored(pending: true)
        try store.save(t)
        let restored = try #require(store.load { _ in }[t.id])
        #expect(restored.reports == nil && restored.reportDrafts == nil)
        #expect(restored.answers == t.answers && restored.unsent == [0])
    }

}
