import GPAPI
import SwiftUI
import Testing

@testable import GrePrep

@MainActor
@Suite("Тексты вопроса и разбора")
struct TrainingTextTests {
    @Test(
        "TOEFL сохраняет названия разделов",
        arguments: [
            (Components.Schemas.Section.reading, "Reading"), (.listening, "Listening"), (.writing, "Writing"),
            (.speaking, "Speaking"),
        ])
    func examSectionLabel(section: Components.Schemas.Section, expected: String) {
        #expect(TrainingText.sectionLabel(section) == expected)
    }

    @Test("Лишние подчёркивания остаются текстом, длинная черта — один пропуск")
    func surplusAndLongBlanksAreLiteral() {
        var t = TrainingFixture.stored()
        var q = TrainingFixture.sample(.textCompletion, blanks: 3)
        q.prompt = "___ / ___ / ___ / ___ / ______"
        t.session.items[0].question = q
        let screen = SessionModel.Screen(training: t, position: 0, selection: [], remaining: nil)
        #expect(
            SessionQuestion(screen: screen, onSelect: { _ in }).spokenPrompt
                == " Пропуск 1  /  Пропуск 2  /  Пропуск 3  / ___ / ______")
        #expect(
            String(SessionQuestion(screen: screen, onSelect: { _ in }).prompt(scale: 1).characters).hasSuffix(
                " / ___ / ______"))
        q.prompt = "______ / ___ / ___"
        t.session.items[0].question = q
        let long = SessionModel.Screen(training: t, position: 0, selection: q.answer, remaining: nil)
        let expected = q.groups.enumerated().map { index, group in
            " " + group.options.first { q.answer.contains($0.id) }!.text + " "
        }.joined(separator: " / ")
        #expect(SessionQuestion(screen: long, onSelect: { _ in }).spokenPrompt == expected)
        #expect(
            String(SessionQuestion(screen: long, onSelect: { _ in }).prompt(scale: 1).characters).filter { $0 == "(" }
                .count == 3)
    }

    @Test("Текст сервера не локализуется и не превращает математику в Markdown")
    func explanationPreservesLiteralContentAndOnlyOurItalics() {
        let plain = "20% of 60\nx_1 … x_2; _literal_; 2 * 3 * 4; 2*3*4; **literal**; [x](y)"
        let text = TrainingText.explanation(plain)
        #expect(String(text.characters) == plain)
        #expect(text.runs.allSatisfy { $0.inlinePresentationIntent == nil })
        let marked = TrainingText.explanation("Use *ornate* for 20% of 60.")
        #expect(String(marked.characters) == "Use ornate for 20% of 60.")
        #expect(
            marked.runs.contains {
                marked[$0.range].characters.elementsEqual("ornate") && $0.inlinePresentationIntent == .emphasized
            })
        #expect(
            String(TrainingText.explanation("Все вопросы").characters)
                == "Все вопросы")
    }

    @Test func summaryMatchesAndroidInBothLanguages() {
        let ru = Locale(identifier: "ru")
        let en = Locale(identifier: "en")
        #expect(TrainingCopy.correctOf(3, locale: ru) == "из 3 верно")
        #expect(TrainingCopy.correctOf(3, locale: en) == "of 3 correct")
        #expect(TrainingCopy.positions([1, 2], locale: ru) == "2 и 3")
        #expect(TrainingCopy.positions([0, 1, 2], locale: en) == "1, 2 and 3")
        #expect(TrainingCopy.positions([1], locale: ru) == "2")
    }

    @Test func summaryAndOverviewCopyMatchesAndroid() {
        let en = Locale(identifier: "en")
        #expect(String(localized: LocalizedStringResource("Итог", locale: en)) == "Results")
        #expect(String(localized: LocalizedStringResource("Готово", locale: en)) == "Done")
        #expect(
            String(localized: LocalizedStringResource("Повторить · \("3 questions")", locale: en))
                == "Review · 3 questions")
        #expect(String(localized: LocalizedStringResource("К вопросу \(2)", locale: en)) == "To question 2")
        #expect(String(localized: LocalizedStringResource("Все вопросы", locale: en)) == "All questions")
        #expect(
            String(localized: LocalizedStringResource("Отвечено \(1) из \(3) · отмечено \(2)", locale: en))
                == "Answered 1 of 3 · marked 2")
        #expect(
            String(localized: LocalizedStringResource("Ошибок нет, но не успели \("2 questions").", locale: en))
                == "No mistakes, but 2 questions ran out of time.")
    }

    @Test("Формы минут и секунд для VoiceOver", arguments: [0, 1, 2, 5, 11, 21, 22])
    func timerPluralForms(number: Int) {
        let ruForm =
            [1, 21].contains(number)
            ? ("минута", "секунда") : [2, 22].contains(number) ? ("минуты", "секунды") : ("минут", "секунд")
        #expect(
            String(
                localized: LocalizedStringResource(
                    "Осталось \(number) минут \(number) секунд", locale: Locale(identifier: "ru")))
                == "Осталось \(number) \(ruForm.0) \(number) \(ruForm.1)")
        let enForm = number == 1 ? ("minute", "second") : ("minutes", "seconds")
        #expect(
            String(
                localized: LocalizedStringResource(
                    "Осталось \(number) минут \(number) секунд", locale: Locale(identifier: "en")))
                == "\(number) \(enForm.0) \(number) \(enForm.1) remaining")
        if number == 1 {
            #expect(
                String(
                    localized: LocalizedStringResource(
                        "Осталось \(1) минут \(22) секунд", locale: Locale(identifier: "ru")))
                    == "Осталось 1 минута 22 секунды")
            #expect(
                String(
                    localized: LocalizedStringResource(
                        "Осталось \(1) минут \(22) секунд", locale: Locale(identifier: "en")))
                    == "1 minute 22 seconds remaining")
        }
    }

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
