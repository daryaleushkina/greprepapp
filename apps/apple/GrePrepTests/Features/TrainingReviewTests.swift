import Foundation
import Testing

@testable import GrePrep

@MainActor
@Suite("Разбор и форма жалобы")
struct TrainingReviewTests {
    let server = StubServer()
    let store = temporaryTrainingStore()
    private func ready(finished: Bool = true) async throws -> (TrainingModel, String) {
        var t = TrainingFixture.stored(finished: finished)
        let q = TrainingFixture.sample(.textCompletion)
        t.session.items = (0..<3).map { .init(position: $0, question: q) }
        t.session.mode = .check
        t.finishSent = finished
        t.answers[0] = .init(
            position: 0, optionIds: q.answer, dontKnow: false, flagged: false, answeredAt: Date(), elapsedMs: 0)
        t.answers[1] = .init(
            position: 1, optionIds: ["C"], dontKnow: false, flagged: false, answeredAt: Date(), elapsedMs: 0)
        try store.saveOwner("person")
        try store.save(t)
        let model = TrainingModel(
            store: store, now: { Date(timeIntervalSince1970: 1_800_000_000) }, report: { _, _ in }, unauthorized: {})
        model.connect(
            api: API(config: server.config(), session: server.session, tokens: MemoryTokenStore("t")), ownerID: "person"
        )
        await eventually { model.trainings[t.id] != nil }
        return (model, t.id)
    }
    @Test func reviewFiltersAndRevealsCheckWithoutChangingPosition() async throws {
        let (trainings, id) = try await ready()
        let review = ReviewModel(id: id, trainings: trainings)
        #expect(review.positions == [0, 1, 2] && review.mistakes == [1, 2])
        #expect(ReviewModel.outcome(review.training!, position: 0) == .correct)
        #expect(ReviewModel.outcome(review.training!, position: 1) == .wrong)
        #expect(ReviewModel.outcome(review.training!, position: 2) == .unanswered)
        review.moveSelection(1)
        #expect(review.selectedPosition == 1)
        review.onlyMistakes = true
        review.moveSelection(10)
        #expect(review.selectedPosition == 2)
        review.moveSelection(-10)
        #expect(review.selectedPosition == 1)
        #expect(review.screen(1)?.revealed == true)
        #expect(review.screen(-1) == nil)
        #expect(trainings.trainings[id]?.position == 0)
        trainings.disconnect(clear: false)
        #expect(review.training == nil && review.positions.isEmpty && review.screen(0) == nil)
        review.moveSelection(1)
    }
    @Test func unfinishedCheckHasNoReview() async throws {
        let (trainings, id) = try await ready(finished: false)
        let review = ReviewModel(id: id, trainings: trainings)
        #expect(review.training == nil && review.mistakes.isEmpty && review.selectedPosition == nil)
    }
    @Test func formPreservesDraftAndSendsOnce() async throws {
        let (trainings, id) = try await ready()
        let form = QuestionReportModel(id: id, position: 1, trainings: trainings)
        form.send()
        #expect(!form.sent)
        form.setText(String(repeating: "x", count: 2001))
        form.setKind(.translation)
        #expect(!form.canSend)
        form.setText("  \n")
        #expect(form.canSend)
        await eventually { trainings.trainings[id]?.reportDrafts?[1]?.text == "  \n" }
        let again = QuestionReportModel(id: id, position: 1, trainings: trainings)
        #expect(again.draft == form.draft)
        let q = try #require(form.question)
        server.on("POST /api/questions/\(q.id)/reports", .failure(.notConnectedToInternet))
        form.send()
        form.send()
        form.setText("ignored")
        await eventually { form.sent }
        #expect(trainings.trainings[id]?.reports?.count == 1)
        #expect(trainings.trainings[id]?.reports?.first?.body.text == nil)
        #expect(!form.canSend && form.draft.text.isEmpty)
        again.cancel {}
        await eventually { !again.saving }
        #expect(trainings.trainings[id]?.reportDrafts?[1] == nil)
        trainings.disconnect(clear: true)
        form.setKind(.other)
        #expect(form.question == nil)
    }
    @Test func formStorageFailureIsVisibleAndRetrySucceeds() async throws {
        let (trainings, id) = try await ready()
        let form = QuestionReportModel(id: id, position: 0, trainings: trainings)
        form.setKind(.other)
        await eventually { trainings.trainings[id]?.reportDrafts?[0]?.kind == .other }
        let backup = store.directory.appendingPathExtension("backup")
        try FileManager.default.moveItem(at: store.directory, to: backup)
        try Data().write(to: store.directory)
        form.send()
        await eventually { form.problem && !form.saving }
        #expect(!form.sent && form.draft.kind == .other)
        form.setText("private-test-marker")
        form.cancel {}
        await eventually { form.problem && !form.saving }
        try FileManager.default.removeItem(at: store.directory)
        try FileManager.default.moveItem(at: backup, to: store.directory)
        form.send()
        await eventually { form.sent }
    }
}
