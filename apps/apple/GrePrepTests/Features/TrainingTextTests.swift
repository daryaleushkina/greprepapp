import Testing

@testable import GrePrep

@MainActor
@Suite("Тексты вопроса и разбора")
struct TrainingTextTests {
    @Test func verdictContainsAllKeysAndRespectsExplanationLanguage() {
        let single = TrainingFixture.question("tc_one_blank_correct")
        #expect(TrainingText.verdict(single, chosen: single.answer, english: false) == "Верно.")
        #expect(TrainingText.verdict(single, chosen: single.answer, english: true) == "Correct.")
        #expect(TrainingText.verdict(single, chosen: ["B"], english: true).hasPrefix("Incorrect. The answer is A"))
        #expect(TrainingText.verdict(single, chosen: [], english: false).hasPrefix("Верный ответ — A"))
        let multiple = TrainingFixture.question("se_correct_reordered")
        #expect(TrainingText.verdict(multiple, chosen: ["B"], english: false).contains("Верные ответы —"))
        #expect(TrainingText.verdict(multiple, chosen: [], english: true).contains("The answers are"))
        #expect(TrainingText.answerList(multiple, english: true).contains(" and "))
        #expect(TrainingText.answerList(multiple, english: false).contains(" и "))
        let blanks = TrainingFixture.sample(.textCompletion, blanks: 3)
        #expect(!TrainingText.answerList(blanks, english: true).contains("A,"))
        #expect(TrainingText.typeLabel(single) == "Text Completion")
        #expect(TrainingText.typeLabel(blanks).contains("3 пропуска"))
        #expect(TrainingText.typeLabel(multiple).contains("два ответа"))
    }

    @Test func missingNamesOnlyUnfilledBlanksOrSecondAnswer() {
        var t = TrainingFixture.stored()
        let q = TrainingFixture.question("tc_three_blanks_correct_reordered")
        t.session.items[0].question = q
        let empty = SessionModel.Screen(training: t, position: 0, selection: [], remaining: nil)
        #expect(TrainingText.missing(empty) == nil)
        let first = q.groups[0].options[0].id
        let twoMissing = SessionModel.Screen(training: t, position: 0, selection: [first], remaining: nil)
        #expect(TrainingText.missing(twoMissing)?.contains("(ii), (iii)") == true)
        let oneMissing = SessionModel.Screen(
            training: t, position: 0, selection: [first, q.groups[1].options[0].id], remaining: nil)
        #expect(TrainingText.missing(oneMissing)?.hasSuffix("(iii)") == true)
        let complete = SessionModel.Screen(training: t, position: 0, selection: q.answer, remaining: nil)
        #expect(TrainingText.missing(complete) == nil)
        t.session.items[0].question = TrainingFixture.question("se_correct_reordered")
        let se = SessionModel.Screen(training: t, position: 0, selection: ["A"], remaining: nil)
        #expect(TrainingText.missing(se) == "Выберите ещё один ответ")
    }
}
