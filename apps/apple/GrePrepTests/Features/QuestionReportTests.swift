import Foundation
import Testing

@testable import GrePrep

@MainActor
@Suite("Жалобы на задания")
struct QuestionReportTests {
    let server = StubServer()
    let store = temporaryTrainingStore()
    let reports = Reports()
    let t = TrainingFixture.stored()
    let draft = QuestionReportDraft(kind: .explanation, text: "private-test-marker")
    var route: String { "POST /api/questions/\(t.session.items[0].question.id)/reports" }

    private func model(owner: String = "person") async throws -> TrainingModel {
        server.on("GET /api/trainings/options", .json(200, TrainingFixture.json(TrainingFixture.options)))
        let model = TrainingModel(
            store: store, report: { message, _ in reports.add(message) },
            unauthorized: { reports.add("unauthorized") })
        model.connect(
            api: API(config: server.config(), session: server.session, tokens: MemoryTokenStore("t")), ownerID: owner)
        _ = try await model.options()
        await model.repository.sync()
        return model
    }
    private func prepare() throws {
        try store.saveOwner("person")
        try store.save(t)
    }

    @Test func offlineSurvivesRelaunchAndSendsLater() async throws {
        try prepare()
        server.on(route, .failure(.notConnectedToInternet))
        let model = try await model()
        try await model.repository.saveReportDraft(t.id, position: 0, draft: draft, epoch: model.revision)
        try await model.repository.recordReport(t.id, position: 0, draft: draft, epoch: model.revision)
        await model.repository.sync()
        #expect(try store.load { _ in }[t.id]?.reports?.count == 1)
        #expect(try store.load { _ in }[t.id]?.reportDrafts?[0] == nil)
        server.on(route, .status(204))
        let again = try await self.model()
        #expect(again.trainings[t.id]?.reports?.isEmpty == true)
        let request = try #require(server.requests(route).last)
        let body = try request.json()
        #expect(body["kind"] as? String == "explanation")
        #expect(body["trainingId"] as? String == t.id)
        #expect(body["text"] as? String == draft.text)
    }

    @Test func draftSurvivesAndCancelRemovesIt() async throws {
        try prepare()
        let model = try await model()
        try await model.repository.saveReportDraft(t.id, position: 0, draft: draft, epoch: model.revision)
        let again = try await self.model()
        #expect(again.trainings[t.id]?.reportDrafts?[0] == draft)
        try await again.repository.saveReportDraft(t.id, position: 0, draft: nil, epoch: again.revision)
        #expect(try store.load { _ in }[t.id]?.reportDrafts?[0] == nil)
        #expect(server.requests(route).isEmpty)
    }

    @Test("Отказы жалоб", arguments: [400, 404, 409, 410, 422, 401, 403, 408, 429, 500, 503])
    func failures(status: Int) async throws {
        try prepare()
        server.on(route, .json(status, Fixture.error(status == 401 ? "unauthorized" : "rejected")))
        let model = try await model()
        try await model.repository.recordReport(t.id, position: 0, draft: draft, epoch: model.revision)
        await model.repository.sync()
        let permanent = [400, 404, 409, 410, 422].contains(status)
        #expect((model.trainings[t.id]?.reports ?? []).isEmpty == permanent)
        #expect(reports.messages.contains { $0.contains("rejected") } == permanent)
        #expect(reports.messages.allSatisfy { !$0.contains(draft.text) })
        if status == 401 {
            #expect(reports.messages.contains("unauthorized"))
            model.disconnect(clear: false)
            server.on(route, .status(204))
            model.connect(
                api: API(config: server.config(), session: server.session, tokens: MemoryTokenStore("t")),
                ownerID: "person")
            _ = try await model.options()
            await model.repository.sync()
            #expect(model.trainings[t.id]?.reports?.isEmpty == true)
        }
    }

    @Test func signOutAndAnotherAccountEraseReportsAndDrafts() async throws {
        try prepare()
        server.on(route, .failure(.notConnectedToInternet))
        let model = try await model()
        try await model.repository.saveReportDraft(t.id, position: 1, draft: draft, epoch: model.revision)
        try await model.repository.recordReport(t.id, position: 0, draft: draft, epoch: model.revision)
        await model.repository.sync()
        let other = try await self.model(owner: "other")
        #expect(other.trainings.isEmpty)
        #expect(try store.load { _ in }.isEmpty)
        #expect(reports.messages.contains { $0.contains("lost 1 unsent reports") })
        try prepare()
        let again = try await self.model()
        try await again.repository.recordReport(t.id, position: 0, draft: draft, epoch: again.revision)
        again.disconnect(clear: true)
        #expect(try store.load { _ in }.isEmpty)
    }

    @Test func unicodeLimitNeverClipsInput() {
        let text = String(repeating: "🇷🇺", count: 1000)
        let boundary = QuestionReportDraft(kind: .other, text: text)
        #expect(boundary.length == 2000 && boundary.canSend)
        let over = QuestionReportDraft(kind: .other, text: text + "x")
        #expect(!over.canSend && over.text == text + "x")
        #expect(!QuestionReportDraft().canSend)
    }
    @Test func lateReportCannotRestoreSignedOutFiles() async throws {
        try prepare()
        let gate = StubServer.Gate()
        defer { gate.open() }
        server.on(route, .gated(gate, 401, Fixture.error("unauthorized")))
        let model = try await model()
        try await model.repository.recordReport(t.id, position: 0, draft: draft, epoch: model.revision)
        await eventually { !server.requests(route).isEmpty }
        model.disconnect(clear: true)
        model.connect(
            api: API(config: server.config(), session: server.session, tokens: MemoryTokenStore("new")),
            ownerID: "other")
        _ = try await model.options()
        gate.open()
        await model.repository.sync()
        #expect(!reports.messages.contains("unauthorized"))
        #expect(try store.load { _ in }.isEmpty)
    }

    @Test func temporaryReportDoesNotBlockOtherReportsAndAnswers() async throws {
        try prepare()
        let model = try await model()
        server.on(route, .json(429, Fixture.error("temporary")))
        let secondRoute = "POST /api/questions/\(t.session.items[1].question.id)/reports"
        server.on(secondRoute, .status(204))
        server.on("POST /api/trainings/\(t.id)/answers", .status(204))
        try await model.repository.recordReport(t.id, position: 0, draft: draft, epoch: model.revision)
        try await model.repository.recordReport(t.id, position: 1, draft: draft, epoch: model.revision)
        await model.repository.answer(t.id, position: 0, optionIDs: ["A"], epoch: model.revision)
        await model.repository.sync()
        #expect(model.trainings[t.id]?.reports?.map(\.position) == [0])
        #expect(model.trainings[t.id]?.unsent.isEmpty == true)
    }

    @Test func rejectedResponseAndDecodeFailureNeverExposeText() async throws {
        try prepare()
        let model = try await model()
        server.on(route, .json(422, Fixture.error(draft.text)))
        try await model.repository.recordReport(t.id, position: 0, draft: draft, epoch: model.revision)
        await model.repository.sync()
        server.on(route, .json(500, draft.text))
        try await model.repository.recordReport(t.id, position: 0, draft: draft, epoch: model.revision)
        await model.repository.sync()
        #expect(reports.messages.allSatisfy { !$0.contains(draft.text) })
        #expect(model.trainings[t.id]?.reports?.count == 1)
    }

    @Test func invalidReportAndDiskFailureKeepDraftAndDoNotSend() async throws {
        try prepare()
        let model = try await model()
        try await model.repository.saveReportDraft(t.id, position: 0, draft: draft, epoch: model.revision)
        for (position, value) in [
            (0, QuestionReportDraft(kind: .other, text: String(repeating: "x", count: 2001))), (-1, draft),
        ] {
            do {
                try await model.repository.recordReport(t.id, position: position, draft: value, epoch: model.revision)
                Issue.record("неверная жалоба принята")
            } catch { #expect(error == .cancelled || error.isReportable) }
        }
        let backup = store.directory.appendingPathExtension("backup")
        try FileManager.default.moveItem(at: store.directory, to: backup)
        try Data().write(to: store.directory)
        do {
            try await model.repository.recordReport(t.id, position: 0, draft: draft, epoch: model.revision)
            Issue.record("не сохранённая жалоба принята")
        } catch { #expect(error.isReportable) }
        #expect(model.trainings[t.id]?.reportDrafts?[0] == draft)
        let pending = model.trainings[t.id]?.reports ?? []
        #expect(pending.isEmpty)
        #expect(server.requests(route).isEmpty)
        try FileManager.default.removeItem(at: store.directory)
        try FileManager.default.moveItem(at: backup, to: store.directory)
    }

    @Test func prunePreservesPendingReportsAndDrafts() async throws {
        try store.saveOwner("person")
        for index in 0..<6 {
            var finished = TrainingFixture.stored(
                id: String(format: "00000000-0000-4000-8000-%012d", index + 900),
                start: Int64(index), finished: true)
            finished.finishSent = true
            if index == 0 { finished.reportDrafts = [0: draft] }
            if index == 1 {
                finished.reports = [
                    .init(
                        id: UUID(), position: 0,
                        body: .init(kind: .other, trainingId: finished.id))
                ]
            }
            try store.save(finished)
        }
        server.on(route, .failure(.notConnectedToInternet))
        let model = try await model()
        #expect(model.trainings.count == 6)
        server.on(route, .json(429, Fixture.error("temporary")))
        await model.repository.sync()
        #expect(model.trainings.count == 5)
        #expect(model.trainings.values.contains { $0.hasReportDrafts })
        #expect(model.trainings.values.contains { !($0.reports ?? []).isEmpty })
    }

    @Test func cancelledTransportRetainsReportWithoutClientError() async throws {
        try prepare()
        server.on(route, .failure(.cancelled))
        let model = try await model()
        try await model.repository.recordReport(t.id, position: 0, draft: draft, epoch: model.revision)
        await model.repository.sync()
        #expect(model.trainings[t.id]?.reports?.count == 1)
        #expect(reports.messages.isEmpty)
    }

    @Test func offlineStopsBeforeNextReport() async throws {
        try prepare()
        let gate = StubServer.Gate()
        defer { gate.open() }
        server.on(route, .gated(gate, 500, Fixture.error("temporary")), .failure(.notConnectedToInternet))
        let secondRoute = "POST /api/questions/\(t.session.items[1].question.id)/reports"
        let model = try await model()
        try await model.repository.recordReport(t.id, position: 0, draft: draft, epoch: model.revision)
        await eventually { !server.requests(route).isEmpty }
        try await model.repository.recordReport(t.id, position: 1, draft: draft, epoch: model.revision)
        gate.open()
        await model.repository.sync()
        #expect(model.trainings[t.id]?.reports?.count == 2)
        #expect(server.requests(secondRoute).isEmpty)
    }

}
