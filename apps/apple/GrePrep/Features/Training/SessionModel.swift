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
    private var elapsedBeforeShowing: Int
    @ObservationIgnored private var cachedResult: Components.Schemas.TrainingSummary?

    struct Screen {
        let training: StoredTraining
        let position: Int
        let selection: [String]
        let remaining: Int?
        var question: Question { training.session.items[position].question }
        var answer: GivenAnswer? { training.answers[position] }
        var revealed: Bool { reviewing || (!training.isCheck && answer != nil) }
        let reviewing: Bool
        var flagged: Bool { answer?.flagged == true }
        var isLast: Bool { position == training.total - 1 }
        var canCheck: Bool { TrainingRules.isComplete(question, selection) }
        var missing: [Int] { TrainingRules.missingGroups(question, selection) }
        func isAnswered(_ index: Int) -> Bool {
            TrainingRules.isComplete(training.session.items[index].question, training.answers[index]?.optionIds ?? [])
        }
        var answeredCount: Int { (0..<training.total).filter(isAnswered).count }
        let result: Components.Schemas.TrainingSummary?
        init(
            training: StoredTraining, position: Int, selection: [String], remaining: Int?,
            result: Components.Schemas.TrainingSummary? = nil, reviewing: Bool = false
        ) {
            self.training = training
            self.position = position
            self.selection = selection
            self.remaining = remaining
            self.result = result
            self.reviewing = reviewing
        }
        var keyboardGroup: Components.Schemas.OptionGroup? {
            let index = missing.first ?? (question.groups.count - 1)
            return question.groups.indices.contains(index) ? question.groups[index] : nil
        }
        var selectionKeys: String {
            let count = min(keyboardGroup?.options.count ?? 0, SessionModel.optionKeys.count)
            guard count > 1 else { return String(SessionModel.optionKeys.prefix(count)) }
            return "A–" + String(SessionModel.optionKeys[count - 1])
        }
    }

    init(id: String, trainings: TrainingModel) {
        self.id = id
        self.trainings = trainings
        epoch = trainings.revision
        date = trainings.currentDate
        shownAt = trainings.currentDate
        let t = trainings.trainings[id]
        elapsedBeforeShowing = t?.answers[t?.position ?? 0]?.elapsedMs ?? 0
    }

    var screen: Screen? {
        guard trainings.revision == epoch, var t = trainings.trainings[id], t.total > 0 else { return nil }
        for (position, answer) in answers { t.answers[position] = answer }
        if let finish { t.finish = finish }
        let p = min(t.total - 1, max(0, position ?? t.position))
        // Законченную тренировку больше нельзя менять; ViewThatFits использует один готовый итог.
        if t.isFinished, cachedResult == nil { cachedResult = TrainingRules.result(t) }
        return Screen(
            training: t, position: p, selection: selection ?? t.answers[p]?.optionIds ?? [],
            remaining: t.isFinished
                ? nil : TrainingRules.remainingSeconds(t, nowMillis: Int64(date.timeIntervalSince1970 * 1000)),
            result: cachedResult)
    }

    private func activeScreen() -> Screen? {
        // Нажатие на границе срока не должно сохранять ответ после конца «Проверки».
        tick()
        guard let s = screen, !s.training.isFinished else { return nil }
        return s
    }

    func select(_ optionID: String) {
        guard let s = activeScreen(), !s.revealed else { return }
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
        let now = visitDate(s.training)
        let elapsed = elapsedBeforeShowing + max(0, Int(now.timeIntervalSince(shownAt) * 1000))
        let boundedElapsed = min(86_400_000, elapsed)
        answers[s.position] = .init(
            position: s.position, optionIds: optionIDs, dontKnow: dontKnow,
            flagged: flagged, answeredAt: now, elapsedMs: boundedElapsed)
        trainings.recordAnswer(
            id, position: s.position, optionIDs: optionIDs, dontKnow: dontKnow,
            flagged: flagged, elapsedMs: boundedElapsed)
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
        guard position != (self.position ?? training.position) else {
            overview = false
            return
        }
        closeVisit()
        self.position = position
        selection = training.answers[position]?.optionIds ?? []
        overview = false
        whyNotOpen = false
        shownAt = trainings.currentDate
        elapsedBeforeShowing = answers[position]?.elapsedMs ?? training.answers[position]?.elapsedMs ?? 0
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
        guard let s = screen, s.training.isCheck, !s.training.isFinished else { return }
        let now = trainings.currentDate
        let remaining = TrainingRules.remainingSeconds(s.training, nowMillis: Int64(now.timeIntervalSince1970 * 1000))
        if remaining != s.remaining { date = now }
        if remaining == 0 { complete(timedOut: true) }
    }

    func end() {
        guard activeScreen() != nil else { return }
        complete(timedOut: false)
    }

    private func complete(timedOut: Bool) {
        closeVisit()
        finish = .init(finishedAt: trainings.currentDate, timedOut: timedOut)
        overview = false
        trainings.recordFinish(id, timedOut: timedOut)
    }

    private func closeVisit() {
        guard let s = screen, !s.training.isFinished else { return }
        // Сохраняем также время после последнего выбора; частичный ответ при этом остаётся частичным.
        if s.training.isCheck || s.answer != nil {
            save(s, optionIDs: s.selection, dontKnow: s.answer?.dontKnow ?? false, flagged: s.flagged)
        }
    }

    private func visitDate(_ training: StoredTraining) -> Date {
        let now = trainings.currentDate
        guard training.isCheck, let limit = training.session.timeLimitSeconds else { return now }
        return min(now, Date(timeIntervalSince1970: Double(training.startedAtMillis) / 1000 + Double(limit)))
    }

    var hasTimer: Bool { screen.map { $0.training.isCheck && !$0.training.isFinished } ?? false }
    nonisolated static let optionKeys = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ")

    /// Буквы относятся к первому незаполненному пропуску; диапазон определяется числом вариантов в группе.
    func selectKey(_ letter: String) {
        guard let s = activeScreen(), !s.revealed, let group = s.keyboardGroup,
            letter.count == 1, let character = letter.uppercased().first,
            let index = Self.optionKeys.firstIndex(of: character), group.options.indices.contains(index)
        else {
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
            exam: s.training.session.exam ?? currentExam, section: s.training.session.section,
            questionTypes: s.training.session.questionTypes,
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
