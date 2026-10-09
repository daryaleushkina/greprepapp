import Foundation
import Observation

/// Разбор не меняет ни ответы, ни позицию продолжаемой тренировки.
@MainActor
@Observable
final class ReviewModel {
    let id: String
    let trainings: TrainingModel
    let epoch: Int
    @ObservationIgnored private var snapshot: Snapshot?
    @MainActor private struct Snapshot {
        let training: StoredTraining
        let outcomes: [Outcome]
        let positions: [Int]
        let mistakes: [Int]
        let correct: Int
        init(_ t: StoredTraining) {
            training = t
            let positions = t.session.items.map(\.position)
            let outcomes = positions.map { ReviewModel.outcome(t, position: $0) }
            self.positions = positions
            self.outcomes = outcomes
            mistakes = positions.filter { outcomes[$0] != .correct }
            correct = outcomes.filter { $0 == .correct }.count
        }
    }
    var onlyMistakes = false
    var selected: Int?

    init(id: String, trainings: TrainingModel) {
        self.id = id
        self.trainings = trainings
        epoch = trainings.revision
    }

    var training: StoredTraining? {
        guard epoch == trainings.revision, let t = trainings.trainings[id], t.isFinished else { return nil }
        if snapshot == nil { snapshot = Snapshot(t) }
        return snapshot?.training
    }
    enum Outcome { case correct, wrong, unanswered }
    static func outcome(_ t: StoredTraining, position: Int) -> Outcome {
        let chosen = t.answers[position]?.optionIds ?? []
        if chosen.isEmpty { return .unanswered }
        return TrainingRules.isCorrect(t.session.items[position].question, chosen) ? .correct : .wrong
    }
    var mistakes: [Int] { training == nil ? [] : snapshot?.mistakes ?? [] }
    var correctCount: Int { training == nil ? 0 : snapshot?.correct ?? 0 }
    var positions: [Int] { training == nil ? [] : (onlyMistakes ? snapshot?.mistakes : snapshot?.positions) ?? [] }
    func outcome(_ position: Int) -> Outcome? {
        guard training != nil, let snapshot, snapshot.outcomes.indices.contains(position) else { return nil }
        return snapshot.outcomes[position]
    }
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
        draft = trainings.reportDraft(id, position: position)
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
        do {
            try trainings.saveReportDraft(id, position: position, draft: value, epoch: epoch)
            problem = false
        } catch { problem = error != .cancelled }
    }
    func send() {
        guard canSend else { return }
        saving = true
        problem = false
        trainings.recordReport(id, position: position, draft: draft) { [weak self] failure in
            guard let self else { return }
            self.saving = false
            guard self.epoch == self.trainings.revision else { return }
            self.problem = failure != nil && failure != .cancelled
            if failure == nil {
                self.sent = true
                self.draft = .init()
            }
        }
    }
    func cancel(completion: @escaping @MainActor @Sendable () -> Void) {
        guard !saving else { return }
        // Отмена закрывает лист даже при смене входа или отказе диска; сбой записи уже обезличен в TrainingModel.
        defer {
            saving = false
            draft = .init()
            completion()
        }
        guard epoch == trainings.revision else { return }
        do {
            try trainings.saveReportDraft(id, position: position, draft: nil, epoch: epoch)
        } catch {
            // TrainingModel уже сообщает о сбое диска; отмена эпохи ожидаема и не требует второго отчёта.
            problem = error != .cancelled
        }
    }
}
