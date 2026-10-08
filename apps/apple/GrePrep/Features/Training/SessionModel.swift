import Foundation
import GPAPI
import Observation

/// Выбор и переход меняются синхронно; запись принадлежит TrainingModel и переживает закрытие экрана.
@MainActor
@Observable
final class SessionModel {
    let id: String
    let trainings: TrainingModel
    private let epoch: Int
    var english: Bool?
    var whyNotOpen = false
    private(set) var overview = false
    private(set) var startingRepeat = false
    private(set) var repeatProblem: BuilderModel.Problem?
    private var position: Int?
    private var selection: [String]?
    private var answers: [Int: GivenAnswer] = [:]
    private var finish: TrainingFinish?
    private var date: Date
    private var shownAt: Date

    struct Screen {
        let training: StoredTraining
        let position: Int
        let selection: [String]
        let remaining: Int?
        var question: Question { training.session.items[position].question }
        var answer: GivenAnswer? { training.answers[position] }
        var revealed: Bool { !training.isCheck && answer != nil }
        var flagged: Bool { answer?.flagged == true }
        var isLast: Bool { position == training.total - 1 }
        var canCheck: Bool { TrainingRules.isComplete(question, selection) }
        var missing: [Int] { TrainingRules.missingGroups(question, selection) }
        var result: Components.Schemas.TrainingSummary? {
            training.isFinished ? TrainingRules.result(training) : nil
        }
    }

    init(id: String, trainings: TrainingModel) {
        self.id = id
        self.trainings = trainings
        epoch = trainings.revision
        date = trainings.currentDate
        shownAt = trainings.currentDate
    }

    var screen: Screen? {
        guard trainings.revision == epoch, var t = trainings.trainings[id], t.total > 0 else { return nil }
        for (position, answer) in answers { t.answers[position] = answer }
        if let finish { t.finish = finish }
        let p = min(t.total - 1, max(0, position ?? t.position))
        return Screen(
            training: t, position: p, selection: selection ?? t.answers[p]?.optionIds ?? [],
            remaining: TrainingRules.remainingSeconds(t, nowMillis: Int64(date.timeIntervalSince1970 * 1000)))
    }

    private func activeScreen() -> Screen? {
        // Нажатие на границе срока не должно сохранять ответ после конца «Проверки».
        tick()
        guard let s = screen, !s.training.isFinished else { return nil }
        return s
    }

    func select(_ optionID: String) {
        guard let s = activeScreen(), !s.revealed, !overview else { return }
        let next = TrainingRules.toggle(s.question, s.selection, optionID)
        selection = next
        if s.training.isCheck { save(s, optionIDs: next, flagged: s.flagged) }
    }

    func check() {
        guard let s = activeScreen(), !s.training.isCheck, !s.revealed, s.canCheck else { return }
        whyNotOpen = false
        save(s, optionIDs: s.selection)
    }

    func dontKnow() {
        guard let s = activeScreen(), !s.training.isCheck, !s.revealed else { return }
        selection = []
        whyNotOpen = false
        save(s, optionIDs: [], dontKnow: true)
    }

    private func save(_ s: Screen, optionIDs: [String], dontKnow: Bool = false, flagged: Bool = false) {
        let elapsed = min(86_400_000, max(0, Int(date.timeIntervalSince(shownAt) * 1000)))
        answers[s.position] = .init(
            position: s.position, optionIds: optionIDs, dontKnow: dontKnow,
            flagged: flagged, answeredAt: date, elapsedMs: elapsed)
        trainings.recordAnswer(
            id, position: s.position, optionIDs: optionIDs, dontKnow: dontKnow,
            flagged: flagged, elapsedMs: elapsed)
    }

    func next() {
        guard let s = activeScreen(), s.training.isCheck || s.revealed else { return }
        if !s.isLast {
            move(s.position + 1, training: s.training)
        } else if s.training.isCheck {
            overview = true
        } else {
            end()
        }
    }

    func goTo(_ position: Int) {
        guard let s = activeScreen(), s.training.isCheck, (0..<s.training.total).contains(position) else { return }
        move(position, training: s.training)
    }

    private func move(_ position: Int, training: StoredTraining) {
        self.position = position
        selection = training.answers[position]?.optionIds ?? []
        overview = false
        whyNotOpen = false
        shownAt = date
        trainings.recordPosition(id, position: position)
    }

    func toggleFlag() {
        guard let s = activeScreen(), s.training.isCheck else { return }
        save(s, optionIDs: s.selection, flagged: !s.flagged)
    }

    func openOverview() {
        guard let s = activeScreen(), s.training.isCheck else { return }
        overview = true
    }
    func closeOverview() { overview = false }

    func tick() {
        date = trainings.currentDate
        guard let s = screen, !s.training.isFinished, s.remaining == 0 else { return }
        complete(timedOut: true)
    }

    func end() {
        guard activeScreen() != nil else { return }
        complete(timedOut: false)
    }

    private func complete(timedOut: Bool) {
        finish = .init(finishedAt: date, timedOut: timedOut)
        overview = false
        trainings.recordFinish(id, timedOut: timedOut)
    }

    /// A–E относятся к первому незаполненному пропуску; заполненный ответ можно изменить касанием.
    func selectKey(_ letter: String) {
        guard let s = activeScreen(), !s.revealed, !overview else { return }
        let group = s.question.groups[s.missing.first ?? (s.question.groups.count - 1)]
        let letters = ["A", "B", "C", "D", "E"]
        guard let index = letters.firstIndex(of: letter.uppercased()), group.options.indices.contains(index) else {
            return
        }
        select(group.options[index].id)
    }

    func repeatMistakes() async -> String? {
        guard let s = screen, let result = s.result, !result.review.isEmpty, !startingRepeat else { return nil }
        startingRepeat = true
        repeatProblem = nil
        defer { startingRepeat = false }
        let request = TrainingRequest(
            section: s.training.session.section, questionTypes: s.training.session.questionTypes,
            topicIds: result.review.map(\.topicId),
            count: TrainingRules.repeatCount(result.review.reduce(0) { $0 + $1.mistakes }), mode: .practice)
        do {
            return try await trainings.start(request)
        } catch {
            switch error {
            case .cancelled: break
            case .offline: repeatProblem = .offline
            case let .server(_, code, _) where code == "no_questions": repeatProblem = .noQuestions
            default: repeatProblem = .failed
            }
            return nil
        }
    }
}
