import Foundation
import Observation
import Testing

@testable import GrePrep

#if os(iOS)
    import UIKit
#endif

@MainActor
@Suite("Разбор и форма жалобы")
struct TrainingReviewTests {
    let server = StubServer()
    let store = temporaryTrainingStore()
    let reports = Reports()

    #if os(iOS)
        @Test func ipadCommandsBelongOnlyToVisibleReview() throws {
            let controller = ReviewKeyResponder()
            var moves: [Int] = []
            var opens = 0
            controller.configure(enabled: true, move: { moves.append($0) }, open: { opens += 1 })
            #expect(controller.keyCommands == nil)
            controller.beginAppearanceTransition(true, animated: false)
            controller.endAppearanceTransition()
            let commands = try #require(controller.keyCommands)
            #expect(commands.count == 3 && commands.allSatisfy(\.wantsPriorityOverSystemBehavior))
            for command in commands {
                let action = try #require(command.action)
                #expect(UIApplication.shared.sendAction(action, to: controller, from: command, for: nil))
            }
            #expect(moves == [-1, 1] && opens == 1)
            controller.configure(enabled: false, move: { moves.append($0) }, open: { opens += 1 })
            #expect(controller.keyCommands == nil)
            for command in commands {
                let action = try #require(command.action)
                #expect(UIApplication.shared.sendAction(action, to: controller, from: command, for: nil))
            }
            #expect(moves == [-1, 1] && opens == 1)
            controller.beginAppearanceTransition(false, animated: false)
            controller.endAppearanceTransition()
            controller.beginAppearanceTransition(true, animated: false)
            controller.endAppearanceTransition()
            #expect(controller.keyCommands == nil)
            controller.configure(enabled: true, move: { moves.append($0) }, open: { opens += 1 })
            controller.beginAppearanceTransition(false, animated: false)
            controller.endAppearanceTransition()
            #expect(controller.keyCommands == nil)
        }
    #endif
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
            store: store, now: { Date(timeIntervalSince1970: 1_800_000_000) },
            report: { message, _ in reports.add(message) }, unauthorized: {})
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
        #expect(review.outcome(-1) == nil && review.correctCount == 1)
        #expect(trainings.trainings[id]?.position == 0)
        trainings.disconnect(clear: false)
        #expect(review.training == nil && review.positions.isEmpty && review.screen(0) == nil)
        review.moveSelection(1)
    }
    @Test func unfinishedCheckHasNoReview() async throws {
        let (trainings, id) = try await ready(finished: false)
        let review = ReviewModel(id: id, trainings: trainings)
        #expect(review.training == nil && review.mistakes.isEmpty && review.selectedPosition == nil)
        #expect(review.outcome(0) == nil && review.correctCount == 0)
        await trainings.repository.finish(id, timedOut: false, epoch: trainings.revision)
        #expect(review.positions == [0, 1, 2] && review.correctCount == 1)
    }
    @Test func finishedReviewKeepsOneSnapshot() async throws {
        let (trainings, id) = try await ready()
        let review = ReviewModel(id: id, trainings: trainings)
        #expect(review.training?.position == 0)
        await trainings.repository.move(id, position: 1, epoch: trainings.revision)
        #expect(trainings.trainings[id]?.position == 1)
        #expect(review.training?.position == 0)
        #expect(review.mistakes == [1, 2])
    }
    @Test func reviewViewInitializationDoesNotReadTrainingModel() async throws {
        let (trainings, id) = try await ready()
        let screen = try #require(ReviewModel(id: id, trainings: trainings).screen(0))
        let changes = Reports()
        withObservationTracking {
            for _ in 0..<300 { _ = ReviewQuestionView(screen: screen, trainings: trainings) }
        } onChange: {
            changes.add("changed")
        }
        await trainings.repository.move(id, position: 1, epoch: trainings.revision)
        #expect(changes.messages.isEmpty)
    }
    @Test func cancelAlwaysClosesAfterEpochOrAccessChanges() async throws {
        for disconnect in [false, true] {
            let (trainings, id) = try await ready()
            let form = QuestionReportModel(id: id, position: 0, trainings: trainings)
            if disconnect { trainings.disconnect(clear: false) } else { _ = trainings.access.renew() }
            var closed = false
            form.cancel { closed = true }
            await eventually { closed && !form.saving }
        }
    }
    @Test func cancelClosesWhileSendIsPendingAndSendStopsSavingAfterLogout() async throws {
        let (trainings, id) = try await ready()
        let form = QuestionReportModel(id: id, position: 0, trainings: trainings)
        form.setKind(.other)
        form.send()
        trainings.disconnect(clear: false)
        var closed = false
        form.cancel { closed = true }
        await eventually { closed && !form.saving }
    }
    @Test func sendStopsSavingAfterEpochChange() async throws {
        let (trainings, id) = try await ready()
        let form = QuestionReportModel(id: id, position: 0, trainings: trainings)
        form.setKind(.other)
        form.send()
        trainings.disconnect(clear: false)
        await eventually { !form.saving }
        #expect(!form.sent)
    }
    @Test func typingIsSynchronousAndDoesNotPublishTraining() async throws {
        let (trainings, id) = try await ready()
        let form = QuestionReportModel(id: id, position: 0, trainings: trainings)
        let changes = Reports()
        withObservationTracking {
            _ = trainings.trainings
        } onChange: {
            changes.add("changed")
        }
        for count in 1...300 { form.setText(String(repeating: "x", count: count)) }
        let reopened = QuestionReportModel(id: id, position: 0, trainings: trainings)
        #expect(reopened.draft.length == 300 && changes.messages.isEmpty)
        form.setText("")
        #expect(trainings.reportDraft(id, position: 0).isEmpty)
        #expect(trainings.reportDraft(id, position: -1).isEmpty)
    }
    @Test func staleVisibleTrainingCannotCreateOrphanDraft() async throws {
        let (trainings, id) = try await ready()
        try store.remove(id)
        let form = QuestionReportModel(id: id, position: 0, trainings: trainings)
        form.setText("x")
        #expect(!FileManager.default.fileExists(atPath: store.directory.appending(path: "report-drafts.json").path))
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
        await eventually { trainings.reportDraft(id, position: 1).text == "  \n" }
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
        #expect(trainings.reportDraft(id, position: 1).isEmpty)
        trainings.disconnect(clear: true)
        form.setKind(.other)
        #expect(form.question == nil)
    }
    @Test func formStorageFailureIsVisibleAndRetrySucceeds() async throws {
        let (trainings, id) = try await ready()
        let form = QuestionReportModel(id: id, position: 0, trainings: trainings)
        form.setKind(.other)
        await eventually { trainings.reportDraft(id, position: 0).kind == .other }
        let backup = store.directory.appendingPathExtension("backup")
        try FileManager.default.moveItem(at: store.directory, to: backup)
        try Data().write(to: store.directory)
        form.send()
        await eventually { form.problem && !form.saving }
        #expect(!form.sent && form.draft.kind == .other)
        form.setText("private-test-marker")
        var closed = false
        form.cancel { closed = true }
        await eventually { closed && !form.saving }
        try FileManager.default.removeItem(at: store.directory)
        try FileManager.default.moveItem(at: backup, to: store.directory)
        #expect(reports.messages.contains { $0.contains("draft storage failed") })
        #expect(reports.messages.allSatisfy { !$0.contains("private-test-marker") })
        let reopened = QuestionReportModel(id: id, position: 0, trainings: trainings)
        reopened.send()
        await eventually { reopened.sent }
    }
}
