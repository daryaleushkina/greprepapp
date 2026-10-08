import Foundation
import Testing

@testable import GrePrep

@Suite("Тренировки на диске")
struct TrainingStoreTests {
    let store = temporaryTrainingStore()

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
}
