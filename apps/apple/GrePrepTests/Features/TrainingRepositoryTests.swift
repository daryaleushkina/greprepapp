import Foundation
import Testing

@testable import GrePrep

@MainActor
@Suite("Очередь тренировок")
struct TrainingRepositoryTests {
    let server = StubServer()
    let store = temporaryTrainingStore()

    private func model(_ pending: [StoredTraining] = [], owner: String = "person") async throws -> (
        TrainingModel, Reports
    ) {
        try store.saveOwner(owner)
        for t in pending { try store.save(t) }
        server.on("GET /api/trainings/options", .json(200, TrainingFixture.json(TrainingFixture.options)))
        let reports = Reports()
        let model = TrainingModel(
            store: store, now: { Date(timeIntervalSince1970: 1_800_000_000) },
            report: { message, _ in reports.add(message) }, unauthorized: { reports.add("unauthorized") })
        model.connect(
            api: API(config: server.config(), session: server.session, tokens: MemoryTokenStore("t")), ownerID: owner)
        _ = try await model.options()
        return (model, reports)
    }

    @Test func startPersistsWholeSessionAndQueriesFourTypes() async throws {
        let (model, _) = try await model()
        server.on("POST /api/trainings", .json(201, TrainingFixture.json(TrainingFixture.session)))
        let id = try await model.start(TrainingFixture.options.presets[0].request)
        let query = try #require(server.requests("GET /api/trainings/options").first?.query)
        for type in ["text_completion", "sentence_equivalence", "quantitative_comparison", "multiple_choice"] {
            #expect(query.contains(type))
        }
        #expect(model.active?.id == id)
        #expect(try store.load { _ in }[id]?.session == TrainingFixture.session)
        #expect(try store.load { _ in }[id]?.ownerID == "person")
    }

    @Test func offlineAnswerSurvivesRelaunchThenSendsBeforeFinish() async throws {
        let t = TrainingFixture.stored()
        server.on("POST /api/trainings/\(t.id)/answers", .failure(.notConnectedToInternet))
        let (model, _) = try await model([t])
        model.recordAnswer(t.id, position: 0, optionIDs: ["A"], elapsedMs: -2)
        model.recordPosition(t.id, position: 1)
        model.recordFinish(t.id, timedOut: false)
        await eventually { model.trainings[t.id]?.finish != nil }
        let disk = try #require(store.load { _ in }[t.id])
        #expect(disk.position == 1 && disk.unsent == [0])
        #expect(disk.answers[0]?.elapsedMs == 0)
        server.on("POST /api/trainings/\(t.id)/answers", .status(204))
        server.on("POST /api/trainings/\(t.id)/finish", .json(200, TrainingFixture.json(TrainingRules.result(disk))))
        let (again, _) = try await self.model()
        await eventually { again.trainings[t.id]?.isSynced == true }
        let paths = server.requests.map(\.path)
        #expect(
            paths.lastIndex(of: "/api/trainings/\(t.id)/answers")! < paths.lastIndex(
                of: "/api/trainings/\(t.id)/finish")!)
        #expect(again.active == nil)
    }

    @Test("Неизлечимые отказы удаляются из очереди и попадают в отчёт", arguments: [400, 404, 409, 410, 422])
    func permanent(_ status: Int) async throws {
        let t = TrainingFixture.stored(pending: true, finished: true)
        server.on("POST /api/trainings/\(t.id)/answers", .json(status, Fixture.error("rejected")))
        server.on("POST /api/trainings/\(t.id)/finish", .json(status, Fixture.error("rejected")))
        let (model, reports) = try await model([t])
        #expect(model.trainings[t.id]?.isSynced == true)
        #expect(reports.messages.filter { $0.contains("rejected") }.count == 2)
    }

    @Test("Временный отказ задерживает одну тренировку", arguments: [403, 408, 429, 500, 503])
    func temporary(_ status: Int) async throws {
        let first = TrainingFixture.stored(pending: true)
        let second = TrainingFixture.stored(
            id: "00000000-0000-4000-8000-000000000101", start: 1_800_000_001_000, pending: true)
        server.on("POST /api/trainings/\(first.id)/answers", .json(status, Fixture.error("temporary")))
        server.on("POST /api/trainings/\(second.id)/answers", .status(204))
        let (model, _) = try await model([first, second])
        #expect(model.trainings[first.id]?.unsent == [0])
        #expect(model.trainings[second.id]?.unsent.isEmpty == true)
    }

    @Test func noNetworkStopsRound() async throws {
        let first = TrainingFixture.stored(pending: true)
        let second = TrainingFixture.stored(
            id: "00000000-0000-4000-8000-000000000101", start: 1_800_000_001_000, pending: true)
        server.on("POST /api/trainings/\(first.id)/answers", .failure(.notConnectedToInternet))
        let (model, _) = try await model([first, second])
        #expect(model.trainings[first.id]?.unsent == [0])
        #expect(server.requests("POST /api/trainings/\(second.id)/answers").isEmpty)
    }

    @Test func expiredCheckFinishesAtDeadlineAndPrunesOnlySynced() async throws {
        var t = TrainingFixture.stored(start: 1_799_999_000_000)
        t.session.mode = .check
        t.session.timeLimitSeconds = 60
        server.on("POST /api/trainings/\(t.id)/finish", .json(200, TrainingFixture.json(TrainingRules.result(t))))
        let (model, _) = try await model([t])
        let result = try #require(model.trainings[t.id])
        #expect(result.finish?.timedOut == true)
        #expect(result.finish?.finishedAt == Date(timeIntervalSince1970: 1_799_999_060))
        #expect(result.finishSent && model.active == nil)
    }

    @Test func changesDuringRequestAreSentAgain() async throws {
        let t = TrainingFixture.stored(pending: true)
        let gate = StubServer.Gate()
        server.on("POST /api/trainings/\(t.id)/answers", .gated(gate, 204, ""), .status(204))
        let reports = Reports()
        try store.saveOwner("person")
        try store.save(t)
        let model = TrainingModel(store: store, report: { message, _ in reports.add(message) }, unauthorized: {})
        model.connect(
            api: API(config: server.config(), session: server.session, tokens: MemoryTokenStore("t")), ownerID: "person"
        )
        await eventually { !server.requests("POST /api/trainings/\(t.id)/answers").isEmpty }
        await model.repository.answer(
            t.id, position: 0, optionIDs: ["B"], elapsedMs: 100_000_000, epoch: model.revision)
        gate.open()
        await eventually { model.trainings[t.id]?.unsent.isEmpty == true }
        #expect(server.requests("POST /api/trainings/\(t.id)/answers").count == 2)
        #expect(model.trainings[t.id]?.answers[0]?.optionIds == ["B"])
        #expect(model.trainings[t.id]?.answers[0]?.elapsedMs == 86_400_000)
    }

    @Test func lateStartAfterDisconnectNeverReturnsToDisk() async throws {
        let (model, _) = try await model()
        let gate = StubServer.Gate()
        server.on("POST /api/trainings", .gated(gate, 201, TrainingFixture.json(TrainingFixture.session)))
        let start = Task { try await model.start(TrainingFixture.options.presets[0].request) }
        await eventually { !server.requests("POST /api/trainings").isEmpty }
        model.disconnect(clear: true)
        gate.open()
        do {
            _ = try await start.value
            Issue.record("поздний старт прошёл")
        } catch { #expect((error as? APIFailure) == .cancelled) }
        #expect(try store.load { _ in }.isEmpty)
    }

    @Test func otherOwnerClearsAndReportsLostAnswers() async throws {
        let t = TrainingFixture.stored(owner: "old", pending: true)
        try store.saveOwner("old")
        try store.save(t)
        let (model, reports) = try await model([], owner: "new")
        #expect(model.trainings.isEmpty)
        #expect(try store.load { _ in }.isEmpty)
        #expect(reports.messages.contains { $0.contains("lost 1 unsent answers") })
    }

    @Test func invalidEditsDoNothingAndFinishedCannotChange() async throws {
        let t = TrainingFixture.stored(finished: true)
        server.on("POST /api/trainings/\(t.id)/finish", .json(200, TrainingFixture.json(TrainingRules.result(t))))
        let (model, _) = try await model([t])
        let epoch = model.revision
        await model.repository.answer(t.id, position: 0, optionIDs: ["B"], epoch: epoch)
        await model.repository.finish(t.id, timedOut: true, epoch: epoch)
        await model.repository.move(t.id, position: -1, epoch: epoch)
        await model.repository.move("missing", position: 1, epoch: epoch)
        #expect(model.trainings[t.id]?.answers.isEmpty == true)
        #expect(model.trainings[t.id]?.finish?.timedOut == false)
        model.disconnect(clear: false)
        await model.repository.move(t.id, position: 1, epoch: epoch)
        #expect(model.trainings.isEmpty)
    }

    @Test func keepsThreeFinishedAndDoesNotPruneUnsent() async throws {
        var all: [StoredTraining] = []
        for index in 0..<5 {
            var t = TrainingFixture.stored(
                id: String(format: "00000000-0000-4000-8000-%012d", index + 200),
                start: 1_799_990_000_000 + Int64(index) * 1000, finished: true)
            t.finishSent = true
            all.append(t)
        }
        let unfinished = TrainingFixture.stored(pending: true)
        server.on("POST /api/trainings/\(unfinished.id)/answers", .json(500, Fixture.error("temporary")))
        let (model, _) = try await model(all + [unfinished])
        #expect(model.trainings.count == 4)
        #expect(model.trainings[all[0].id] == nil && model.trainings[all[1].id] == nil)
        #expect(model.trainings[unfinished.id]?.unsent == [0])
        #expect(try store.load { _ in }.count == 4)
    }

    @Test("Отказ завершения не теряется и не держит остальные", arguments: [0, 401, 403, 500])
    func finishFailure(status: Int) async throws {
        let first = TrainingFixture.stored(finished: true)
        let second = TrainingFixture.stored(
            id: "00000000-0000-4000-8000-000000000101", start: 1_800_000_001_000, finished: true)
        server.on(
            "POST /api/trainings/\(first.id)/finish",
            status == 0
                ? .failure(.notConnectedToInternet)
                : .json(status, Fixture.error(status == 401 ? "unauthorized" : "temporary")))
        server.on(
            "POST /api/trainings/\(second.id)/finish", .json(200, TrainingFixture.json(TrainingRules.result(second))))
        let (model, reports) = try await model([first, second])
        #expect(model.trainings[first.id]?.finishSent == false)
        #expect(model.trainings[second.id]?.finishSent == (status != 0 && status != 401))
        if status == 401 { #expect(reports.messages.contains("unauthorized")) }
    }

    @Test func diskFailureKeepsAnswerInMemoryAndNextWriteRecovers() async throws {
        let t = TrainingFixture.stored()
        let (model, reports) = try await model([t])
        server.on("POST /api/trainings/\(t.id)/answers", .failure(.notConnectedToInternet))
        let backup = store.directory.appendingPathExtension("backup")
        try FileManager.default.moveItem(at: store.directory, to: backup)
        try Data("occupied".utf8).write(to: store.directory)
        await model.repository.answer(t.id, position: 0, optionIDs: ["B"], epoch: model.revision)
        #expect(model.trainings[t.id]?.answers[0]?.optionIds == ["B"])
        #expect(reports.messages.contains { $0.contains("storage failed") })
        try FileManager.default.removeItem(at: store.directory)
        try FileManager.default.moveItem(at: backup, to: store.directory)
        await model.repository.move(t.id, position: 1, epoch: model.revision)
        #expect(try store.load { _ in }[t.id]?.answers[0]?.optionIds == ["B"])
    }

    @Test func lateAnswerAndUnauthorizedCannotAffectNewAccount() async throws {
        let t = TrainingFixture.stored(pending: true)
        try store.saveOwner("person")
        try store.save(t)
        let gate = StubServer.Gate()
        server.on("POST /api/trainings/\(t.id)/answers", .gated(gate, 401, Fixture.error("unauthorized")))
        let reports = Reports()
        let model = TrainingModel(
            store: store, report: { message, _ in reports.add(message) }, unauthorized: { reports.add("unauthorized") })
        let api = API(config: server.config(), session: server.session, tokens: MemoryTokenStore("t"))
        model.connect(api: api, ownerID: "person")
        await eventually { !server.requests("POST /api/trainings/\(t.id)/answers").isEmpty }
        model.disconnect(clear: true)
        model.connect(api: api, ownerID: "new")
        server.on("GET /api/trainings/options", .json(200, TrainingFixture.json(TrainingFixture.options)))
        _ = try await model.options()
        gate.open()
        await model.repository.sync()
        #expect(!reports.messages.contains("unauthorized"))
        #expect(try store.load { _ in }.isEmpty)
    }

    @Test func corruptedOwnerIsQuarantinedAndReported() async throws {
        let t = TrainingFixture.stored()
        try store.save(t)
        try Data("broken".utf8).write(to: store.directory.appending(path: "owner.json"))
        let reports = Reports()
        let model = TrainingModel(store: store, report: { message, _ in reports.add(message) }, unauthorized: {})
        server.on("GET /api/trainings/options", .json(200, TrainingFixture.json(TrainingFixture.options)))
        model.connect(
            api: API(config: server.config(), session: server.session, tokens: MemoryTokenStore("t")), ownerID: "person"
        )
        _ = try await model.options()
        #expect(model.trainings[t.id] != nil)
        #expect(reports.messages.contains { $0.contains("owner unreadable") })
        let files = try FileManager.default.contentsOfDirectory(at: store.directory, includingPropertiesForKeys: nil)
        #expect(files.contains { $0.pathExtension == "broken" })
    }

    @Test func queuedStartCannotMoveToNewLogin() async throws {
        let t = TrainingFixture.stored(owner: "old", pending: true)
        try store.saveOwner("old")
        try store.save(t)
        let gate = StubServer.Gate()
        defer { gate.open() }
        server.on("POST /api/trainings/\(t.id)/answers", .gated(gate, 204, ""))
        server.on("GET /api/trainings/options", .json(200, TrainingFixture.json(TrainingFixture.options)))
        server.on("POST /api/trainings", .json(201, TrainingFixture.json(TrainingFixture.session)))
        let model = TrainingModel(store: store, report: { _, _ in }, unauthorized: {})
        model.connect(
            api: API(config: server.config(), session: server.session, tokens: MemoryTokenStore("old")), ownerID: "old")
        await eventually { !server.requests("POST /api/trainings/\(t.id)/answers").isEmpty }
        var requested = false
        let start = Task {
            requested = true
            return try await model.start(TrainingFixture.options.presets[0].request)
        }
        await eventually { requested }
        model.disconnect(clear: true)
        model.connect(
            api: API(config: server.config(), session: server.session, tokens: MemoryTokenStore("new")), ownerID: "new")
        _ = try await model.options()
        gate.open()
        do {
            _ = try await start.value
            Issue.record("запрос прошлого входа начался под новым")
        } catch { #expect((error as? APIFailure) == .cancelled) }
        #expect(server.requests("POST /api/trainings").isEmpty)
    }

    @Test func failedAccountCleanupNeverExposesOldData() async throws {
        let t = TrainingFixture.stored(owner: "old", pending: true)
        server.on("POST /api/trainings/\(t.id)/answers", .failure(.notConnectedToInternet))
        let (model, reports) = try await model([t], owner: "old")
        let parent = store.directory.deletingLastPathComponent()
        try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: parent.path)
        defer {
            do { try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: parent.path) } catch {
                Issue.record("не восстановились права тестовой папки")
            }
        }
        model.connect(
            api: API(config: server.config(), session: server.session, tokens: MemoryTokenStore("new")),
            ownerID: Fixture.user.id)
        _ = try await model.options()
        #expect(reports.messages.contains { $0.contains("storage failed") })
        #expect(model.trainings.isEmpty)
        await model.repository.sync()
        #expect(server.requests("POST /api/trainings/\(t.id)/answers").allSatisfy { $0.authorization != "Bearer new" })
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: parent.path)
        server.on("GET /api/me", .json(200, TrainingFixture.json(Fixture.user)))
        server.on("POST /api/trainings", .json(201, TrainingFixture.json(TrainingFixture.session)))
        _ = try await model.start(TrainingFixture.options.presets[0].request)
        #expect(try store.load { _ in }.values.allSatisfy { $0.ownerID == Fixture.user.id })
    }
}

final class Reports: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String] = []
    func add(_ message: String) { lock.withLock { values.append(message) } }
    var messages: [String] { lock.withLock { values } }
}
