import Foundation
import GPAPI
import Testing

@testable import GrePrep

@MainActor
@Suite("Конструктор тренировки")
struct BuilderModelTests {
    let server = StubServer()
    func model(prefill: BuilderPrefill? = nil, loadsOnInit: Bool = false) -> BuilderModel {
        let trainings = TrainingModel(store: temporaryTrainingStore(), report: { _, _ in }, unauthorized: {})
        trainings.connect(
            api: API(config: server.config(), session: server.session, tokens: MemoryTokenStore("t")), ownerID: "person"
        )
        return BuilderModel(trainings: trainings, prefill: prefill, loadsOnInit: loadsOnInit)
    }

    @Test func loadsOptionsAtInitialization() async {
        server.on("GET /api/trainings/options", .json(200, TrainingFixture.json(TrainingFixture.options)))
        let model = model(loadsOnInit: true)
        await eventually { model.options != nil }
        #expect(server.requests("GET /api/trainings/options").count == 1)
    }

    @Test func reloadPreservesEditsAndRemovesMissingChoices() {
        let model = model()
        model.use(TrainingFixture.options)
        model.setCount("3")
        model.setMode(.check)
        model.setDifficulty(.hard)
        model.toggleTopic("contrast")
        let form = model.form
        model.use(TrainingFixture.options)
        #expect(model.form == form && model.preset == nil)
        var options = TrainingFixture.options
        options.types[0].topics.removeAll { $0.id == "clauses" }
        model.use(options)
        #expect(model.form.topicIDs == ["context"])
        #expect(model.form.countText == "3" && model.form.difficulty == .hard && model.form.mode == .check)
        options.types.removeAll { $0.questionType == .textCompletion }
        model.use(options)
        #expect(model.form.type == .sentenceEquivalence && model.form.topicIDs == nil)
        #expect(model.form.countText == "3" && model.form.mode == .check && model.form.difficulty == .hard)
    }

    @Test func presetReloadTracksKindRatherThanIndex() {
        let model = model()
        model.use(TrainingFixture.options)
        model.selectPreset(1)
        var options = TrainingFixture.options
        options.presets.reverse()
        model.use(options)
        #expect(model.preset == 0 && model.request == options.presets[0].request)
        options.presets.removeFirst()
        model.use(options)
        #expect(model.preset == nil)
    }

    @Test func defaultLastAndKnownPresets() {
        let model = model()
        #expect(model.request == nil)
        model.setCount("7")
        model.use(TrainingFixture.options)
        #expect(model.preset == 0)
        #expect(model.request == TrainingFixture.options.presets[0].request)
        #expect(model.minutes(model.request!) == 15)
        model.selectPreset(1)
        #expect(model.request?.questionTypes.count == 2)
        #expect(model.form.mode == .practice)
        model.selectPreset(20)
        #expect(model.preset == 1)
        var options = TrainingFixture.options
        options.presets.append(.init(kind: "unknown", request: options.presets[0].request))
        model.use(options)
        #expect(model.presets.count == 2)
    }

    @Test func selectedSingleTypePresetReflectsUpdatedRequest() {
        let model = model()
        var options = TrainingFixture.options
        model.use(options)
        model.setCount("3")
        model.selectPreset(0)
        #expect(model.form.countText == "10" && model.form.mode == .practice)
        options.presets[0].request.count = 6
        options.presets[0].request.mode = .check
        options.presets[0].request.topicIds = ["context"]
        options.presets[0].request.difficulty = .medium
        model.use(options)
        #expect(model.form.countText == "6" && model.form.mode == .check)
        #expect(model.form.topicIDs == ["context"] && model.form.difficulty == .medium)
        #expect(model.request == options.presets[0].request)
    }

    @Test func prefillAndCustomFields() {
        let model = model(prefill: .init(section: .quant, type: .multipleChoice))
        model.use(TrainingFixture.options)
        #expect(model.preset == nil && model.form.type == .multipleChoice)
        #expect(model.request == nil)
        model.setType(.quantitativeComparison)
        model.setCount("x99x88")
        #expect(model.form.countText == "99" && model.request?.count == 12)
        model.setMode(.check)
        model.setSection(.verbal)
        #expect(model.form.type == .textCompletion && model.form.mode == .check && model.form.countText == "99")
        #expect(model.request?.count == 30)
        model.setSection(.verbal)
        model.setType(.textCompletion)
        model.setCount("")
        #expect(model.request == nil)
        model.setCount("0")
        #expect(model.request == nil)
        model.setCount("4")
        #expect(model.request?.count == 4)
    }

    @Test func topicsAllSomeEmptyAndDifficultyCounts() {
        let model = model()
        model.use(TrainingFixture.options)
        #expect(model.available == 45)
        model.setDifficulty(.easy)
        #expect(model.available == 15)
        model.setDifficulty(.medium)
        #expect(model.available == 22)
        model.setDifficulty(.hard)
        #expect(model.available == 8)
        model.setDifficulty(nil)
        model.toggleTopic("missing")
        #expect(model.form.topicIDs == nil)
        for topic in model.topics { model.toggleTopic(topic.id) }
        #expect(model.form.topicIDs == [] && model.available == 0 && model.request == nil)
        model.toggleTopic("context")
        #expect(model.available == 24)
        model.toggleTopic("contrast")
        model.toggleTopic("clauses")
        #expect(model.form.topicIDs == nil)
        model.setType(.sentenceEquivalence)
        #expect(model.topics.isEmpty)
    }

    @Test func noLastUsesAvailableTypeAndFallback() {
        var options = TrainingFixture.options
        options.presets = []
        let model = model()
        model.use(options)
        #expect(model.form.type == .textCompletion && model.request?.count == 10)
        options.types = []
        model.use(options)
        #expect(model.form.type == .textCompletion && model.request == nil)
        let quant = self.model(prefill: .init(section: .quant))
        quant.use(options)
        #expect(quant.form.type == .quantitativeComparison)
        options.types = [.init(section: .verbal, questionType: .sentenceEquivalence, paceSeconds: 90, topics: [])]
        model.use(options)
        #expect(model.form.type == .sentenceEquivalence)
    }

    @Test("Отказы загрузки и повтор", arguments: [true, false])
    func loadFailure(offline: Bool) async {
        server.on(
            "GET /api/trainings/options",
            offline ? .failure(.notConnectedToInternet) : .json(500, Fixture.error("internal")))
        let model = model()
        await model.load()
        guard case let .unavailable(problem) = model.content else {
            Issue.record("нет ошибки")
            return
        }
        #expect(problem == (offline ? .offline : .failed))
        server.on("GET /api/trainings/options", .json(200, TrainingFixture.json(TrainingFixture.options)))
        await model.load()
        #expect(model.options == TrainingFixture.options)
    }

    @Test("Отказы старта", arguments: [409, 500, 0])
    func startFailure(status: Int) async {
        let model = model()
        model.use(TrainingFixture.options)
        server.on(
            "POST /api/trainings",
            status == 0
                ? .failure(.notConnectedToInternet)
                : .json(status, Fixture.error(status == 409 ? "no_questions" : "internal")))
        #expect(await model.start() == nil)
        #expect(model.problem == (status == 0 ? .offline : status == 409 ? .noQuestions : .failed))
        #expect(!model.starting)
        model.setCount("5")
        #expect(model.problem == nil)
    }

    @Test func doubleStartAndSuccess() async {
        let model = model()
        model.use(TrainingFixture.options)
        let gate = StubServer.Gate()
        server.on("POST /api/trainings", .gated(gate, 201, TrainingFixture.json(TrainingFixture.session)))
        let task = Task { await model.start() }
        await eventually { model.starting }
        #expect(await model.start() == nil)
        gate.open()
        #expect(await task.value == TrainingFixture.session.id)
        #expect(!model.starting && model.problem == nil)
    }

    @Test func singleTypePresetAndFilteredTopics() {
        var options = TrainingFixture.options
        options.presets = [
            .init(
                kind: "last",
                request: .init(
                    section: .quant, questionTypes: [.quantitativeComparison], topicIds: ["numbers"], difficulty: .hard,
                    count: 5, mode: .check))
        ]
        let model = model()
        model.use(options)
        #expect(model.form.topicIDs == ["numbers"] && model.form.difficulty == .hard)
        model.selectPreset(0)
        model.setCount("7")
        #expect(model.request?.count == 3 && model.request?.topicIds == ["numbers"])
        options.presets[0].request.topicIds = []
        model.use(options)
        #expect(model.form.topicIDs == ["numbers"])
        #expect(model.form.countText == "7" && model.form.difficulty == .hard)
    }
}
