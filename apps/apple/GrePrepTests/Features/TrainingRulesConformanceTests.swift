import Foundation
import GPAPI
import Testing

@testable import GrePrep

@Suite("Общие правила тренировок: договор")
struct TrainingRulesConformanceTests {
    private func cases() throws -> Cases {
        let url = try #require(Bundle(for: TestBundle.self).url(forResource: "training-rules", withExtension: "json"))
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(Cases.self, from: Data(contentsOf: url))
    }
    @Test func answers() throws {
        let all = try cases().answers.filter { !$0.badAnswer }
        #expect(!all.isEmpty)
        for c in all { #expect(TrainingRules.isCorrect(c.question, c.answer.optionIds) == c.correct, "\(c.name)") }
    }
    @Test func summaries() throws {
        let all = try cases().summaries
        #expect(!all.isEmpty)
        for c in all {
            #expect(TrainingRules.result(stored(c.session, c.startedAtMillis, c.finish)) == c.expected, "\(c.name)")
        }
    }
    @Test func toggles() throws {
        let all = try cases().toggles
        #expect(!all.isEmpty)
        for c in all { #expect(TrainingRules.toggle(c.question, c.selection, c.optionId) == c.expected, "\(c.name)") }
    }
    @Test func missingGroups() throws {
        let all = try cases().missingGroups
        #expect(!all.isEmpty)
        for c in all {
            #expect(TrainingRules.missingGroups(c.question, c.selection) == c.expected, "\(c.name)")
            #expect(TrainingRules.isComplete(c.question, c.selection) == c.complete, "\(c.name)")
        }
    }
    @Test func clocks() throws {
        let all = try cases().clocks
        #expect(!all.isEmpty)
        for c in all {
            let t = stored(c.session, c.startedAtMillis, c.finish)
            #expect(TrainingRules.remainingSeconds(t, nowMillis: c.nowMillis) == c.remainingSeconds, "\(c.name)")
            #expect(TrainingRules.durationSeconds(t) == c.durationSeconds, "\(c.name)")
        }
    }
    @Test func minutes() throws {
        let all = try cases().minutes
        #expect(!all.isEmpty)
        for c in all {
            let result = TrainingRules.summaryMinutes(c.durationSeconds, limit: c.limitSeconds)
            #expect(result.minutes == c.minutes && result.limit == c.limitMinutes, "\(c.name)")
        }
    }
    @Test func repeats() throws {
        let all = try cases().repeats
        #expect(!all.isEmpty)
        for c in all { #expect(TrainingRules.repeatCount(c.mistakes) == c.count, "\(c.name)") }
    }
    private func stored(_ session: TrainingSession, _ start: Int64, _ finish: TrainingFinish?) -> StoredTraining {
        StoredTraining(
            ownerID: "test", session: session, startedAtMillis: start,
            answers: Dictionary(uniqueKeysWithValues: session.items.compactMap { $0.answer }.map { ($0.position, $0) }),
            finish: finish)
    }
}
private final class TestBundle: NSObject {}
private struct Cases: Decodable {
    let answers: [AnswerCase]
    let summaries: [SummaryCase]
    let toggles: [ToggleCase]
    let missingGroups: [MissingCase]
    let clocks: [ClockCase]
    let minutes: [MinutesCase]
    let repeats: [RepeatCase]
}
private struct AnswerCase: Decodable {
    let name: String
    let question: Question
    let answer: GivenAnswer
    let correct: Bool
    let badAnswer: Bool
}
private struct SummaryCase: Decodable {
    let name: String
    let startedAtMillis: Int64
    let session: TrainingSession
    let finish: TrainingFinish
    let expected: Components.Schemas.TrainingSummary
}
private struct ToggleCase: Decodable {
    let name: String
    let question: Question
    let selection: [String]
    let optionId: String
    let expected: [String]
}
private struct MissingCase: Decodable {
    let name: String
    let question: Question
    let selection: [String]
    let expected: [Int]
    let complete: Bool
}
private struct ClockCase: Decodable {
    let name: String
    let startedAtMillis: Int64
    let nowMillis: Int64
    let session: TrainingSession
    let finish: TrainingFinish?
    let remainingSeconds: Int?
    let durationSeconds: Int
}
private struct MinutesCase: Decodable {
    let name: String
    let durationSeconds: Int
    let limitSeconds: Int?
    let minutes: Int
    let limitMinutes: Int?
}
private struct RepeatCase: Decodable {
    let name: String
    let mistakes: Int
    let count: Int
}
