import Foundation
import GPAPI
import Observation
import Testing

@testable import GrePrep

@MainActor
@Suite("Вопрос и итог тренировки")
struct SessionModelTests {
    let server = StubServer()
    let store = temporaryTrainingStore()
    let clock = TrainingTestClock()

    @Test func keyboardSelectsSixthSEOption() async throws {
        let q = TrainingFixture.sample(.sentenceEquivalence)
        let (model, _) = try await model(question: q)
        #expect(model.screen?.selectionKeys == "A–F")
        model.selectKey("f")
        #expect(model.screen?.selection == [q.groups[0].options[5].id])
        model.selectKey("A")
        #expect(model.screen?.canCheck == true)
        model.selectKey("G")
        #expect(model.screen?.selection.count == 2)
    }

    @Test func wideOverviewQuestionStillAcceptsSelection() async throws {
        let (model, _) = try await model(check: true)
        model.openOverview()
        model.select("A")
        #expect(model.screen?.selection == ["A"])
        model.selectKey("B")
        #expect(model.screen?.selection == ["B"])
        #expect(model.overview)
    }

    @Test func overviewRequiresAllThreeBlanksButPartialAnswerIsStillWrong() async throws {
        let q = TrainingFixture.sample(.textCompletion, blanks: 3)
        let (model, _) = try await model(check: true, question: q)
        for option in q.answer.dropLast() { model.select(option) }
        #expect(model.screen?.answeredCount == 0)
        #expect(model.screen?.isAnswered(0) == false)
        model.end()
        #expect(model.screen?.result?.correct == 0)
        #expect(model.screen?.result?.unanswered == model.screen!.training.total - 1)
        var complete = try #require(model.screen?.training)
        complete.answers[0]?.optionIds = q.answer
        #expect(
            SessionModel.Screen(training: complete, position: 0, selection: q.answer, remaining: nil).answeredCount == 1
        )
    }

    @Test func elapsedAccumulatesVisitsWithoutDoubleCountingSameVisit() async throws {
        let (model, trainings) = try await model(check: true)
        clock.advance(4)
        model.select("A")
        clock.advance(2)
        model.toggleFlag()
        #expect(model.screen?.answer?.elapsedMs == 6000)
        clock.advance(1)
        model.next()
        clock.advance(3)
        model.goTo(0)
        clock.advance(2)
        model.select("B")
        #expect(model.screen?.answer?.elapsedMs == 9000)
        clock.advance(1)
        model.toggleFlag()
        #expect(model.screen?.answer?.elapsedMs == 10000)
        model.end()
        await eventually { trainings.trainings[model.id]?.answers[0]?.elapsedMs == 10000 }
        let resumed = SessionModel(id: model.id, trainings: trainings)
        #expect(resumed.screen?.answer?.elapsedMs == 10000)
    }

    @Test func skippedVisitTimeSurvivesRelaunch() async throws {
        let (model, trainings) = try await model(check: true)
        clock.advance(4)
        model.next()
        await eventually { trainings.trainings[model.id]?.position == 1 }
        let resumed = SessionModel(id: model.id, trainings: trainings)
        resumed.goTo(0)
        clock.advance(2)
        resumed.select("A")
        #expect(resumed.screen?.answer?.elapsedMs == 6000)
    }

    @Test func tickDoesNotInvalidatePracticeOrFinishedScreen() async throws {
        let (model, _) = try await model()
        let practiceChanged = SessionObservationFlag()
        withObservationTracking {
            _ = model.screen
        } onChange: {
            practiceChanged.mark()
        }
        clock.advance(2)
        model.tick()
        #expect(!practiceChanged.changed)
        model.select("A")
        model.check()
        #expect(model.screen?.answer?.elapsedMs == 2000)
        model.end()
        let finishedChanged = SessionObservationFlag()
        withObservationTracking {
            _ = model.screen
        } onChange: {
            finishedChanged.mark()
        }
        clock.advance(3)
        model.tick()
        #expect(!finishedChanged.changed)
    }

    func model(check: Bool = false, question: Question? = nil, exam: Components.Schemas.Exam? = .gre) async throws -> (
        SessionModel, TrainingModel
    ) {
        var t = TrainingFixture.stored()
        t.session.exam = exam
        if let question { t.session.items[0].question = question }
        if check {
            t.session.mode = .check
            t.session.timeLimitSeconds = 60
        }
        try store.saveOwner("person")
        try store.save(t)
        server.on("POST /api/trainings/\(t.id)/answers", .failure(.notConnectedToInternet))
        let trainings = TrainingModel(
            store: store, now: { clock.now },
            report: { _, _ in }, unauthorized: {})
        trainings.connect(
            api: API(config: server.config(), session: server.session, tokens: MemoryTokenStore("t")), ownerID: "person"
        )
        await eventually { trainings.trainings[t.id] != nil }
        return (SessionModel(id: t.id, trainings: trainings), trainings)
    }

    @Test func practiceChecksThenAdvancesAndFinishesWithoutNetwork() async throws {
        let (model, trainings) = try await model()
        model.next()
        #expect(model.screen?.position == 0)
        model.select("A")
        #expect(model.screen?.selection == ["A"])
        #expect(model.screen?.revealed == false)
        model.check()
        #expect(model.screen?.revealed == true)
        model.select("B")
        #expect(model.screen?.selection == ["A"])
        model.next()
        #expect(model.screen?.position == 1)
        model.select("B")
        model.check()
        model.next()
        let total = try #require(model.screen?.training.total)
        for _ in 2..<total {
            model.dontKnow()
            model.next()
        }
        #expect(model.screen?.result?.correct == 1)
        await eventually { trainings.trainings[model.id]?.isFinished == true }
        #expect(trainings.active == nil)
        #expect(try store.load { _ in }[model.id]?.finish != nil)
    }

    @Test func checkSavesSelectionAndFlagsImmediatelyReturnsFromList() async throws {
        let (model, trainings) = try await model(check: true)
        model.toggleFlag()
        model.next()
        model.select("B")
        model.openOverview()
        #expect(model.overview)
        model.goTo(0)
        #expect(!model.overview && model.screen?.flagged == true)
        model.select("A")
        #expect(model.screen?.selection == ["A"])
        await eventually { trainings.trainings[model.id]?.answers[0]?.optionIds == ["A"] }
        #expect(trainings.trainings[model.id]?.answers[1]?.optionIds == ["B"])
        model.end()
        #expect(model.screen?.result?.correct == 1)
    }

    @Test(
        "Четыре типа и все пропуски",
        arguments: [
            "tc_one_blank_correct", "tc_two_blanks_correct_reordered", "tc_three_blanks_correct_reordered",
            "se_correct_reordered", "quantitative_comparison_correct", "multiple_choice_correct",
        ])
    func allTypesRequireCompleteAnswer(name: String) async throws {
        let q = TrainingFixture.question(name)
        let (model, _) = try await model(question: q)
        model.check()
        #expect(model.screen?.revealed == false)
        model.select("foreign")
        #expect(model.screen?.selection == [])
        for option in q.answer.dropLast() { model.select(option) }
        #expect(model.screen?.canCheck == false)
        let missing = TrainingRules.missingGroups(q, model.screen?.selection ?? [])
        #expect(!missing.isEmpty)
        model.check()
        #expect(model.screen?.revealed == false)
        model.select(q.answer.last!)
        #expect(model.screen?.canCheck == true)
        model.check()
        #expect(model.screen?.revealed == true)
        #expect(TrainingRules.isCorrect(q, model.screen?.selection ?? []))
        model.check()
        model.dontKnow()
        #expect(model.screen?.selection == q.answer)
    }

    @Test func elapsedAndDontKnowSurviveRelaunchAndImmediateClose() async throws {
        var (model, trainings) = try await model()
        clock.advance(4)
        model.select("B")
        model.check()
        model.next()
        model.dontKnow()
        model.next()
        // Все три действия пишутся после ухода со страницы; новая модель восстанавливает вопрос и ответ.
        model = SessionModel(id: model.id, trainings: trainings)
        await eventually { trainings.trainings[model.id]?.position == 2 }
        let saved = try #require(store.load { _ in }[model.id])
        #expect(saved.answers[0]?.elapsedMs == 4000)
        #expect(saved.answers[1]?.dontKnow == true && saved.answers[1]?.optionIds == [])
        let restarted = TrainingModel(store: store, now: { clock.now }, report: { _, _ in }, unauthorized: {})
        restarted.connect(
            api: API(config: server.config(), session: server.session, tokens: MemoryTokenStore("t")), ownerID: "person"
        )
        await eventually { restarted.trainings[model.id] != nil }
        let resumed = SessionModel(id: model.id, trainings: restarted)
        #expect(resumed.screen?.position == 2 && resumed.screen?.selection == [])
        #expect(resumed.screen?.training.answers[1]?.dontKnow == true)
    }

    @Test func timerUsesWallClockAndStopsLateAnswerAtDeadline() async throws {
        let (model, trainings) = try await model(check: true)
        model.select("B")
        clock.advance(10)
        model.tick()
        #expect(model.screen?.remaining == 50)
        // Нет тиков во время «блокировки»: срок всё равно наступает.
        clock.advance(60)
        model.select("A")
        #expect(model.screen?.training.finish?.timedOut == true)
        #expect(model.screen?.training.answers[0]?.optionIds == ["B"])
        let result = try #require(model.screen?.result)
        #expect(result.unanswered == result.total - 1)
        #expect(result.review.count == 1 && result.review[0].mistakes == 1)
        #expect(result.durationSeconds == 60)
        await eventually { trainings.trainings[model.id]?.finish?.timedOut == true }
        #expect(trainings.active == nil)
        model.tick()
        model.end()
        model.toggleFlag()
        model.next()
        model.goTo(1)
        #expect(model.screen?.training.finish?.timedOut == true && model.screen?.position == 0)
    }

    @Test func navigationGuardsLastQuestionAndSelectionRestoration() async throws {
        let (model, _) = try await model(check: true)
        model.check()
        model.dontKnow()
        #expect(model.screen?.answer == nil)
        model.select("C")
        model.toggleFlag()
        model.toggleFlag()
        model.openOverview()
        model.closeOverview()
        model.goTo(-1)
        model.goTo(999)
        #expect(model.screen?.position == 0)
        let last = try #require(model.screen?.training.total) - 1
        model.goTo(last)
        model.next()
        #expect(model.overview)
        model.goTo(0)
        #expect(model.screen?.selection == ["C"] && model.screen?.flagged == false)
        model.end()
        model.end()
        #expect(model.screen?.training.finish?.timedOut == false)
    }

    @Test func practiceCannotJumpAndKeyboardFillsGroups() async throws {
        let q = TrainingFixture.question("tc_three_blanks_correct_reordered")
        let (model, _) = try await model(question: q)
        #expect(model.screen?.selectionKeys == "A–C")
        model.goTo(1)
        model.openOverview()
        model.toggleFlag()
        #expect(!model.overview && model.screen?.position == 0)
        model.selectKey("x")
        model.selectKey("E")
        #expect(model.screen?.selection == [])
        model.selectKey("a")
        model.selectKey("b")
        model.selectKey("c")
        #expect(model.screen?.selection == q.groups.enumerated().map { $0.element.options[$0.offset].id })
        model.whyNotOpen = true
        model.check()
        #expect(!model.whyNotOpen)
        model.selectKey("a")
        #expect(model.screen?.revealed == true)
    }

    @Test func missingAndOldAccountIgnoreActions() async throws {
        let (model, trainings) = try await model()
        let missing = SessionModel(id: "missing", trainings: trainings)
        missing.select("A")
        missing.check()
        missing.dontKnow()
        missing.next()
        missing.goTo(0)
        missing.toggleFlag()
        missing.openOverview()
        missing.end()
        missing.selectKey("A")
        #expect(await missing.repeatMistakes() == nil)
        #expect(missing.screen == nil)
        trainings.disconnect(clear: false)
        model.select("A")
        #expect(model.screen == nil)
    }

    @Test("Повтор: сеть и отказы", arguments: [201, 409, 500, 0, -1])
    func repeatUsesReviewTopicsAndHandlesFailures(status: Int) async throws {
        let (model, _) = try await model()
        model.dontKnow()
        model.end()
        var session = TrainingFixture.session
        session.id = "00000000-0000-4000-8000-000000000222"
        server.on(
            "POST /api/trainings",
            status == 201
                ? .json(201, TrainingFixture.json(session))
                : status == 0
                    ? .failure(.notConnectedToInternet)
                    : status == -1
                        ? .failure(.cancelled)
                        : .json(status, Fixture.error(status == 409 ? "no_questions" : "internal")))
        let result = await model.repeatMistakes()
        #expect(result == (status == 201 ? session.id : nil))
        #expect(!model.startingRepeat)
        #expect(
            model.repeatProblem
                == (status == 0 ? .offline : status == 409 ? .noQuestions : status == 500 ? .failed : nil))
        let body = try #require(server.requests("POST /api/trainings").first).json()
        #expect(body["mode"] as? String == "practice")
        #expect(
            body["count"] as? Int
                == TrainingRules.repeatCount(model.screen!.result!.review.reduce(0) { $0 + $1.mistakes }))
        #expect(body["topicIds"] as? [String] == model.screen?.result?.review.map(\.topicId))
    }

    @Test(
        "Повтор сохраняет экзамен сессии и поддерживает старый формат",
        arguments: [Components.Schemas.Exam?.some(.toefl), nil])
    func repeatPreservesExam(exam: Components.Schemas.Exam?) async throws {
        let (model, _) = try await model(exam: exam)
        model.dontKnow()
        model.end()
        server.on("POST /api/trainings", .json(409, Fixture.error("no_questions")))
        _ = await model.repeatMistakes()
        let body = try #require(server.requests("POST /api/trainings").first).json()
        #expect(body["exam"] as? String == (exam?.rawValue ?? "gre"))
    }

    @Test func repeatPreventsDoubleStartAndDoesNothingWithoutMistakes() async throws {
        let (model, _) = try await model()
        #expect(await model.repeatMistakes() == nil)
        model.dontKnow()
        model.end()
        let gate = StubServer.Gate()
        defer { gate.open() }
        server.on("POST /api/trainings", .gated(gate, 201, TrainingFixture.json(TrainingFixture.session)))
        let task = Task { await model.repeatMistakes() }
        await eventually { model.startingRepeat }
        #expect(await model.repeatMistakes() == nil)
        gate.open()
        #expect(await task.value != nil)
    }
}

private final class SessionObservationFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false
    var changed: Bool { lock.withLock { value } }
    func mark() { lock.withLock { value = true } }
}
