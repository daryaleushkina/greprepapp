import Foundation
import Observation

/// Разбор не меняет ни ответы, ни позицию продолжаемой тренировки.
@MainActor
@Observable
final class ReviewModel {
    let id: String
    let trainings: TrainingModel
    private let epoch: Int
    var onlyMistakes = false
    var selected: Int?

    init(id: String, trainings: TrainingModel) {
        self.id = id
        self.trainings = trainings
        epoch = trainings.revision
    }

    var training: StoredTraining? {
        guard epoch == trainings.revision, let t = trainings.trainings[id], t.isFinished else { return nil }
        return t
    }
    enum Outcome { case correct, wrong, unanswered }
    static func outcome(_ t: StoredTraining, position: Int) -> Outcome {
        let chosen = t.answers[position]?.optionIds ?? []
        if chosen.isEmpty { return .unanswered }
        return TrainingRules.isCorrect(t.session.items[position].question, chosen) ? .correct : .wrong
    }
    var mistakes: [Int] {
        guard let t = training else { return [] }
        return t.session.items.filter { Self.outcome(t, position: $0.position) != .correct }.map(\.position)
    }
    var positions: [Int] { onlyMistakes ? mistakes : training?.session.items.map(\.position) ?? [] }
    var selectedPosition: Int? {
        if let selected, positions.contains(selected) { return selected }
        return positions.first
    }
    func moveSelection(_ step: Int) {
        guard let position = selectedPosition, let index = positions.firstIndex(of: position) else { return }
        selected = positions[min(positions.count - 1, max(0, index + step))]
    }
    func screen(_ position: Int) -> SessionModel.Screen? {
        guard let t = training, (0..<t.total).contains(position) else { return nil }
        return .init(
            training: t, position: position, selection: t.answers[position]?.optionIds ?? [], remaining: nil,
            reviewing: true)
    }
}

@MainActor
@Observable
final class QuestionReportModel {
    let id: String
    let position: Int
    let trainings: TrainingModel
    private let epoch: Int
    private(set) var draft: QuestionReportDraft
    private(set) var saving = false
    private(set) var sent = false
    private(set) var problem = false

    init(id: String, position: Int, trainings: TrainingModel) {
        self.id = id
        self.position = position
        self.trainings = trainings
        epoch = trainings.revision
        draft = trainings.trainings[id]?.reportDrafts?[position] ?? .init()
    }
    var question: Question? {
        guard epoch == trainings.revision, let t = trainings.trainings[id], t.session.items.indices.contains(position)
        else { return nil }
        return t.session.items[position].question
    }
    var canSend: Bool { draft.canSend && question != nil && !saving && !sent }
    func setKind(_ kind: ReportKind) { edit(.init(kind: kind, text: draft.text)) }
    func setText(_ text: String) { edit(.init(kind: draft.kind, text: text)) }
    private func edit(_ value: QuestionReportDraft) {
        guard !saving, !sent, question != nil else { return }
        draft = value
        trainings.editReport(id, position: position, draft: value) { [weak self] failure in
            guard let self, self.epoch == self.trainings.revision else { return }
            self.problem = failure != nil && failure != .cancelled
        }
    }
    func send() {
        guard canSend else { return }
        saving = true
        problem = false
        trainings.editReport(id, position: position, draft: draft, send: true) { [weak self] failure in
            guard let self, self.epoch == self.trainings.revision else { return }
            self.saving = false
            self.problem = failure != nil && failure != .cancelled
            if failure == nil {
                self.sent = true
                self.draft = .init()
            }
        }
    }
    func cancel(completion: @escaping @MainActor @Sendable () -> Void) {
        guard !saving else { return }
        saving = true
        trainings.editReport(id, position: position, draft: nil) { [weak self] failure in
            guard let self, self.epoch == self.trainings.revision else { return }
            self.saving = false
            self.problem = failure != nil && failure != .cancelled
            if failure == nil {
                self.draft = .init()
                completion()
            }
        }
    }
}
