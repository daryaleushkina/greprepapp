import Foundation
import GPAPI

@testable import GrePrep

/// Только открытый набор договора: задания для проверки, платного контента здесь нет.
enum TrainingFixture {
    private final class ResourceBundle: NSObject {}
    private struct Cases: Decodable {
        let summaries: [Summary]
        let answers: [AnswerCase]
    }
    private struct AnswerCase: Decodable {
        let name: String
        let question: Question
    }
    private struct Summary: Decodable { let session: TrainingSession }
    private struct Seed: Decodable {
        struct Item: Decodable {
            struct Body: Decodable {
                let prompt: String
                let condition: String?
                let quantityA: String?
                let quantityB: String?
                let groups: [Components.Schemas.OptionGroup]
                let selectCount: Int
            }
            let id: String
            let type: Components.Schemas.QuestionType
            let topic: String
            let difficulty: Components.Schemas.Difficulty
            let body: Body
            let answer: [String]
            let explanation: Components.Schemas.Explanation
        }
        let questions: [Item]
        struct Topic: Decodable {
            let id: String
            let title: Components.Schemas.LocalizedText
        }
        let topics: [Topic]
    }
    static func sample(_ type: Components.Schemas.QuestionType, blanks: Int = 1) -> Question {
        let url = Bundle(for: ResourceBundle.self).url(forResource: "questions", withExtension: "json")!
        let seed = try! JSONDecoder().decode(Seed.self, from: Data(contentsOf: url))
        let q = seed.questions.first { $0.type == type && $0.body.groups.count == blanks }!
        return Question(
            id: q.id, questionType: q.type,
            section: type == .textCompletion || type == .sentenceEquivalence ? .verbal : .quant,
            topicId: q.topic, topicTitle: seed.topics.first { $0.id == q.topic }!.title, difficulty: q.difficulty,
            prompt: q.body.prompt, condition: q.body.condition, quantityA: q.body.quantityA,
            quantityB: q.body.quantityB,
            groups: q.body.groups, selectCount: q.body.selectCount, answer: q.answer, explanation: q.explanation)
    }
    static func question(_ name: String) -> Question {
        let url = Bundle(for: ResourceBundle.self).url(forResource: "training-rules", withExtension: "json")!
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(Cases.self, from: Data(contentsOf: url)).answers.first { $0.name == name }!.question
    }
    static var session: TrainingSession {
        let url = Bundle(for: ResourceBundle.self).url(forResource: "training-rules", withExtension: "json")!
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        var session = try! decoder.decode(Cases.self, from: Data(contentsOf: url)).summaries[0].session
        session.items = session.items.map { .init(position: $0.position, question: $0.question) }
        return session
    }
    static let options = TrainingOptions(
        types: [
            .init(
                section: .verbal, questionType: .textCompletion, paceSeconds: 90,
                topics: [
                    .init(
                        id: "context",
                        title: .init(ru: "Контекст и смысл предложения", en: "Context and sentence meaning"),
                        available: .init(easy: 8, medium: 12, hard: 4)),
                    .init(
                        id: "contrast", title: .init(ru: "Противопоставление", en: "Contrast"),
                        available: .init(easy: 5, medium: 7, hard: 2)),
                    .init(
                        id: "clauses",
                        title: .init(ru: "Длинные предложения с вставками", en: "Long sentences with clauses"),
                        available: .init(easy: 2, medium: 3, hard: 2)),
                ]),
            .init(section: .verbal, questionType: .sentenceEquivalence, paceSeconds: 90, topics: []),
            .init(
                section: .quant, questionType: .quantitativeComparison, paceSeconds: 105,
                topics: [
                    .init(
                        id: "numbers", title: .init(ru: "Числа", en: "Numbers"),
                        available: .init(easy: 5, medium: 4, hard: 3))
                ]),
            .init(section: .quant, questionType: .multipleChoice, paceSeconds: 105, topics: []),
        ],
        presets: [
            .init(
                kind: "last",
                request: .init(section: .verbal, questionTypes: [.textCompletion], count: 10, mode: .practice)),
            .init(
                kind: "timed",
                request: .init(
                    section: .verbal, questionTypes: [.textCompletion, .sentenceEquivalence], count: 12, mode: .check)),
        ],
        maxQuestions: 30)

    static func json<T: Encodable>(_ value: T) -> String {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return String(data: try! encoder.encode(value), encoding: .utf8)!
    }
    static func stored(
        id: String = "00000000-0000-4000-8000-000000000100", owner: String = "person",
        start: Int64 = 1_800_000_000_000, pending: Bool = false, finished: Bool = false
    ) -> StoredTraining {
        var session = session
        session.id = id
        var t = StoredTraining(ownerID: owner, session: session, startedAtMillis: start)
        if pending {
            t.answers[0] = .init(
                position: 0, optionIds: ["A"], dontKnow: false, flagged: false,
                answeredAt: Date(timeIntervalSince1970: Double(start) / 1000), elapsedMs: 200)
            t.unsent = [0]
        }
        if finished {
            t.finish = .init(finishedAt: Date(timeIntervalSince1970: Double(start) / 1000 + 200), timedOut: false)
        }
        return t
    }
}

/// Часы теста: фон, блокировка и возврат проверяются без ожидания настоящего времени.
final class TrainingTestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var date = Date(timeIntervalSince1970: 1_800_000_000)
    var now: Date { lock.withLock { date } }
    func advance(_ seconds: TimeInterval) { lock.withLock { date.addTimeInterval(seconds) } }
}

func temporaryTrainingStore() -> TrainingStore {
    TrainingStore(
        directory: FileManager.default.temporaryDirectory.appending(
            path: "Application Support \(UUID().uuidString)/trainings"))
}
