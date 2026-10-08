import Foundation
import GPAPI
import Observation

struct BuilderPrefill: Hashable, Sendable {
    let section: Components.Schemas.Section
    var type: Components.Schemas.QuestionType?
}

struct BuilderForm: Equatable {
    var section: Components.Schemas.Section
    var type: Components.Schemas.QuestionType
    var countText = "10"
    var mode: Components.Schemas.TrainingMode = .practice
    var topicIDs: Set<String>?
    var difficulty: Components.Schemas.Difficulty?
    var count: Int? { Int(countText).flatMap { $0 > 0 ? $0 : nil } }
}

@MainActor
@Observable
final class BuilderModel {
    enum Problem { case offline, failed, noQuestions }
    enum Content {
        case loading
        case unavailable(Problem)
        case ready
    }
    private(set) var content: Content = .loading
    private(set) var options: TrainingOptions?
    private(set) var form = BuilderForm(section: .verbal, type: .textCompletion)
    private(set) var preset: Int?
    private(set) var starting = false
    private(set) var problem: Problem?
    @ObservationIgnored private let trainings: TrainingModel
    @ObservationIgnored private let prefill: BuilderPrefill?
    @ObservationIgnored private var loadRevision = 0

    init(trainings: TrainingModel, prefill: BuilderPrefill? = nil) {
        self.trainings = trainings
        self.prefill = prefill
    }

    var presets: [Components.Schemas.TrainingPreset] {
        options?.presets.filter { ["last", "timed"].contains($0.kind) } ?? []
    }
    var topics: [Components.Schemas.TrainingTopic] {
        options?.types.first { $0.questionType == form.type }?.topics ?? []
    }
    var types: [Components.Schemas.TrainingType] { options?.types.filter { $0.section == form.section } ?? [] }
    var available: Int {
        topics.filter { form.topicIDs == nil || form.topicIDs?.contains($0.id) == true }.reduce(0) { count, topic in
            let n = topic.available
            switch form.difficulty {
            case nil: return count + n.easy + n.medium + n.hard
            case .easy: return count + n.easy
            case .medium: return count + n.medium
            case .hard: return count + n.hard
            }
        }
    }
    var request: TrainingRequest? {
        guard let options else { return nil }
        if let preset { return presets.indices.contains(preset) ? presets[preset].request : nil }
        guard let count = form.count else { return nil }
        let questions = min(count, available, options.maxQuestions)
        guard questions > 0 else { return nil }
        return .init(
            section: form.section, questionTypes: [form.type], topicIds: form.topicIDs.map { $0.sorted() },
            difficulty: form.difficulty, count: questions, mode: form.mode)
    }

    func minutes(_ request: TrainingRequest) -> Int {
        let pace = options?.types.first { request.questionTypes.contains($0.questionType) }?.paceSeconds ?? 0
        return Int(ceil(Double(request.count * pace) / 60))
    }

    func load() async {
        loadRevision += 1
        let revision = loadRevision
        content = .loading
        do {
            let options = try await trainings.options()
            guard revision == loadRevision else { return }
            use(options)
        } catch {
            guard revision == loadRevision, error != .cancelled else { return }
            content = .unavailable(error == .offline ? .offline : .failed)
        }
    }

    /// Снимки и тесты используют тот же путь выбора формы, что ответ сервера.
    func use(_ options: TrainingOptions) {
        self.options = options
        preset = prefill == nil ? presets.firstIndex { $0.kind == "last" } : nil
        if let prefill {
            form = defaultForm(section: prefill.section, type: prefill.type)
        } else if let preset {
            form = formOf(presets[preset].request)
        } else {
            form = defaultForm(section: .verbal, type: nil)
        }
        problem = nil
        content = .ready
    }

    private func edit(_ action: (inout BuilderForm) -> Void) {
        guard options != nil else { return }
        action(&form)
        preset = nil
        problem = nil
    }
    func selectPreset(_ index: Int) {
        guard presets.indices.contains(index) else { return }
        let p = presets[index]
        if p.request.questionTypes.count == 1 { form = formOf(p.request) }
        preset = index
        problem = nil
    }
    func setSection(_ section: Components.Schemas.Section) {
        let next = defaultForm(section: section, type: nil)
        edit {
            if $0.section != section {
                let old = $0
                $0 = next
                $0.countText = old.countText
                $0.mode = old.mode
            }
        }
    }
    func setType(_ type: Components.Schemas.QuestionType) {
        edit {
            if $0.type != type {
                $0.type = type
                $0.topicIDs = nil
            }
        }
    }
    func setCount(_ text: String) { edit { $0.countText = String(text.filter(\.isNumber).prefix(2)) } }
    func setMode(_ mode: Components.Schemas.TrainingMode) { edit { $0.mode = mode } }
    func setDifficulty(_ difficulty: Components.Schemas.Difficulty?) { edit { $0.difficulty = difficulty } }
    func toggleTopic(_ id: String) {
        let all = Set(topics.map(\.id))
        guard all.contains(id) else { return }
        edit {
            var selected = $0.topicIDs ?? all
            if !selected.insert(id).inserted { selected.remove(id) }
            $0.topicIDs = selected == all ? nil : selected
        }
    }

    func start() async -> String? {
        guard !starting, let request else { return nil }
        starting = true
        problem = nil
        defer { starting = false }
        do { return try await trainings.start(request) } catch {
            if case let .server(_, code, _) = error, code == "no_questions" {
                problem = .noQuestions
            } else if error != .cancelled {
                problem = error == .offline ? .offline : .failed
            }
            return nil
        }
    }

    private func defaultForm(section: Components.Schemas.Section, type: Components.Schemas.QuestionType?) -> BuilderForm
    {
        let types = options?.types.filter { $0.section == section } ?? []
        let chosen =
            type.flatMap { t in types.contains { $0.questionType == t } ? t : nil }
            ?? types.first { !$0.topics.isEmpty }?.questionType ?? types.first?.questionType
            ?? (section == .quant ? .quantitativeComparison : .textCompletion)
        return BuilderForm(section: section, type: chosen)
    }
    private func formOf(_ request: TrainingRequest) -> BuilderForm {
        var f = defaultForm(section: request.section, type: request.questionTypes.first)
        f.countText = String(request.count)
        f.mode = request.mode
        f.topicIDs = request.topicIds.flatMap { $0.isEmpty ? nil : Set($0) }
        f.difficulty = request.difficulty
        return f
    }
}
