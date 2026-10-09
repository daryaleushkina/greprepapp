import Foundation
import GPAPI

typealias TrainingSession = Components.Schemas.TrainingSession
typealias TrainingRequest = Components.Schemas.TrainingRequest
typealias TrainingOptions = Components.Schemas.TrainingOptions
typealias GivenAnswer = Components.Schemas.GivenAnswer
typealias TrainingFinish = Components.Schemas.TrainingFinish
typealias Question = Components.Schemas.Question

struct StoredTraining: Codable, Sendable, Equatable {
    let ownerID: String
    var session: TrainingSession
    var startedAtMillis: Int64
    var answers: [Int: GivenAnswer] = [:]
    var unsent: Set<Int> = []
    var position = 0
    var finish: TrainingFinish?
    var finishSent = false
    // Optional сохраняет совместимость с файлами первых частей тренировок.
    var reports: [PendingQuestionReport]?
    // Только для переноса файлов прежней версии в отдельную запись черновиков.
    var reportDrafts: [Int: QuestionReportDraft]?

    var id: String { session.id }
    var total: Int { session.items.count }
    var isCheck: Bool { session.mode == .check }
    var isFinished: Bool { finish != nil }
    var isSynced: Bool { unsent.isEmpty && (reports ?? []).isEmpty && (finish == nil || finishSent) }
}

typealias QuestionReport = Components.Schemas.QuestionReport
typealias ReportKind = QuestionReport.KindPayload

struct QuestionReportDraft: Codable, Sendable, Equatable {
    var kind: ReportKind?
    var text = ""
    // Договор считает кодовые точки, а не графемы или байты UTF-8.
    static let maxLength = 2000
    var length: Int { text.unicodeScalars.count }
    var canSend: Bool { kind != nil && length <= Self.maxLength }
    var isEmpty: Bool { kind == nil && text.isEmpty }
}

struct PendingQuestionReport: Codable, Sendable, Equatable, Identifiable {
    let id: UUID
    let position: Int
    let body: QuestionReport
}

/// Клиентские правила из общего договора; темп и лимит приходят готовыми с сервера.
enum TrainingRules {
    static func isCorrect(_ question: Question, _ optionIDs: [String]) -> Bool {
        optionIDs.count == question.answer.count && Set(optionIDs) == Set(question.answer)
    }

    static func missingGroups(_ question: Question, _ selection: [String]) -> [Int] {
        question.groups.indices.filter { index in
            question.groups[index].options.filter { selection.contains($0.id) }.count < question.selectCount
        }
    }

    static func isComplete(_ question: Question, _ selection: [String]) -> Bool {
        missingGroups(question, selection).isEmpty
    }

    static func toggle(_ question: Question, _ selection: [String], _ optionID: String) -> [String] {
        guard let group = question.groups.first(where: { $0.options.contains(where: { $0.id == optionID }) }) else {
            return selection
        }
        let inGroup = Set(group.options.map(\.id))
        if question.selectCount == 1 { return selection.filter { !inGroup.contains($0) } + [optionID] }
        if selection.contains(optionID) { return selection.filter { $0 != optionID } }
        let chosen = selection.filter { inGroup.contains($0) }
        let trimmed = chosen.count >= question.selectCount ? selection.filter { $0 != chosen[0] } : selection
        return trimmed + [optionID]
    }

    static func remainingSeconds(_ training: StoredTraining, nowMillis: Int64) -> Int? {
        guard training.isCheck, let limit = training.session.timeLimitSeconds else { return nil }
        return max(0, limit - Int((nowMillis - training.startedAtMillis) / 1000))
    }

    static func durationSeconds(_ training: StoredTraining) -> Int {
        guard let end = training.finish?.finishedAt else { return 0 }
        let seconds = max(0, Int((Int64(end.timeIntervalSince1970 * 1000) - training.startedAtMillis) / 1000))
        if training.isCheck, let limit = training.session.timeLimitSeconds { return min(seconds, limit) }
        return seconds
    }

    static func summaryMinutes(_ duration: Int, limit: Int?) -> (minutes: Int, limit: Int?) {
        let limitMinutes = limit.map { Int(ceil(Double($0) / 60)) }
        let minutes = max(1, Int((Double(duration) / 60).rounded()))
        return (limitMinutes.map { min(minutes, $0) } ?? minutes, limitMinutes)
    }

    static func repeatCount(_ mistakes: Int) -> Int { min(10, max(5, mistakes * 2)) }

    static func result(_ training: StoredTraining) -> Components.Schemas.TrainingSummary {
        let timedOut = training.isCheck && training.finish?.timedOut == true
        var correct = 0
        var unanswered = 0
        var topics: [Components.Schemas.TopicToReview] = []
        for item in training.session.items {
            let answer = training.answers[item.position]
            let chosen = answer?.optionIds ?? []
            if !chosen.isEmpty && isCorrect(item.question, chosen) {
                correct += 1
                continue
            }
            if chosen.isEmpty {
                unanswered += 1
                if timedOut && answer?.dontKnow != true { continue }
            }
            let question = item.question
            if let index = topics.firstIndex(where: { $0.topicId == question.topicId }) {
                topics[index].mistakes += 1
                topics[index].positions.append(item.position)
            } else {
                topics.append(
                    .init(
                        topicId: question.topicId, title: question.topicTitle, mistakes: 1,
                        positions: [item.position]))
            }
        }
        // Индекс встречи — явный второй ключ: равные темы сохраняют порядок первого вопроса.
        let review = topics.enumerated().sorted {
            $0.element.mistakes == $1.element.mistakes
                ? $0.offset < $1.offset : $0.element.mistakes > $1.element.mistakes
        }.prefix(3).map(\.element)
        return .init(
            correct: correct, total: training.total, unanswered: unanswered,
            durationSeconds: durationSeconds(training), review: review)
    }
}
