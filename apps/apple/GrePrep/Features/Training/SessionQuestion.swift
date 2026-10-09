import GPAPI
import SwiftUI

enum TrainingText {
    static let blanks = ["(i)", "(ii)", "(iii)"]

    static func explanation(_ text: String) -> AttributedString {
        // В договоре курсив обозначен одиночными * вокруг слов. Остальная разметка и математика — текст.
        let pattern = #/\*([^\s*](?:[^*\n]*[^\s*])?)\*/#
        var markdown = ""
        var start = text.startIndex
        for match in text.matches(of: pattern) {
            let before =
                match.range.lowerBound == text.startIndex ? nil : text[text.index(before: match.range.lowerBound)]
            let after = match.range.upperBound == text.endIndex ? nil : text[match.range.upperBound]
            guard
                ![before, after].contains(where: { character in
                    character.map { $0.isLetter || $0.isNumber || $0 == "_" || $0 == "*" } ?? false
                })
            else { continue }
            markdown += escapedMarkdown(String(text[start..<match.range.lowerBound]))
            markdown += "*" + escapedMarkdown(String(match.output.1)) + "*"
            start = match.range.upperBound
        }
        markdown += escapedMarkdown(String(text[start...]))
        do {
            return try AttributedString(
                markdown: markdown, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))
        } catch {
            // Если разметка не разобралась, весь текст остаётся доступен без оформления.
            return AttributedString(text)
        }
    }

    private static func escapedMarkdown(_ text: String) -> String {
        text.reduce(into: "") { result, character in
            if #"\`*_{}[]<>()#+-.!|~&"#.contains(character) { result.append("\\") }
            result.append(character)
        }
    }

    enum PromptPart: Equatable {
        case text(String)
        case blank(Int)
    }

    /// Одна непрерывная черта соответствует одной группе. Лишние черты остаются буквальным текстом.
    static func promptParts(_ question: Question) -> [PromptPart] {
        let prompt = question.prompt
        var parts: [PromptPart] = []
        var start = prompt.startIndex
        var group = 0
        for match in prompt.matches(of: #/_{3,}/#) {
            guard group < question.groups.count else { break }
            parts.append(.text(String(prompt[start..<match.range.lowerBound])))
            parts.append(.blank(group))
            start = match.range.upperBound
            group += 1
        }
        parts.append(.text(String(prompt[start...])))
        return parts
    }

    static func blankLabel(_ index: Int) -> String {
        blanks.indices.contains(index) ? blanks[index] : "(\(index + 1))"
    }

    static func typeLabel(_ q: Question) -> String {
        if q.groups.count > 1 { return q.questionType.label + " · " + String(localized: "\(q.groups.count) пропуска") }
        if q.selectCount > 1 { return q.questionType.label + " · " + String(localized: "два ответа") }
        return q.questionType.label
    }

    static func missing(_ s: SessionModel.Screen) -> String? {
        guard !s.selection.isEmpty, !s.missing.isEmpty else { return nil }
        if s.question.groups.count > 1 {
            let numbers = s.missing.map(blankLabel).joined(separator: ", ")
            return s.missing.count == 1
                ? String(localized: "Осталось выбрать слово для пропуска \(numbers)")
                : String(localized: "Осталось выбрать слова для пропусков \(numbers)")
        }
        return s.question.selectCount > 1 ? String(localized: "Выберите ещё один ответ") : nil
    }

    static func answerList(_ q: Question, english: Bool) -> String {
        let options = q.groups.flatMap(\.options)
        let words = q.answer.compactMap { id in
            options.first { $0.id == id }.map { q.groups.count > 1 ? $0.text : "\($0.id), \($0.text)" }
        }
        guard words.count > 1 else { return words.joined() }
        return words.dropLast().joined(separator: ", ") + (english ? " and " : " и ") + (words.last ?? "")
    }

    static func verdict(_ q: Question, chosen: [String], english: Bool) -> String {
        if !chosen.isEmpty && TrainingRules.isCorrect(q, chosen) { return english ? "Correct." : "Верно." }
        let lead = chosen.isEmpty ? "" : (english ? "Incorrect. " : "Неверно. ")
        let key =
            english
            ? (q.answer.count > 1 ? "The answers are " : "The answer is ")
            : (q.answer.count > 1 ? "Верные ответы — " : "Верный ответ — ")
        return lead + key + answerList(q, english: english) + "."
    }
}

/// Условие и варианты остаются рядом после ответа: правильный и выбранный различаются цветом и словами.
struct SessionQuestion: View {
    let screen: SessionModel.Screen
    let onSelect: (String) -> Void
    var onReport: (() -> Void)?
    @Environment(\.textScale) private var textScale
    var section: StudySection { StudySection(screen.training.session.section) }
    var question: Question { screen.question }

    var body: some View {
        VStack(alignment: .leading, spacing: GPSpace.s20) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: GPSpace.s12) { heading }
                VStack(alignment: .leading, spacing: GPSpace.s4) { heading }
            }
            if question.questionType == .quantitativeComparison {
                quantities
            } else {
                Text(prompt(scale: textScale)).gpText(GPType.prompt).fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel(Text(verbatim: spokenPrompt)).accessibilityIdentifier("question.prompt")
            }
            ForEach(Array(question.groups.enumerated()), id: \.offset) { index, group in
                if screen.revealed {
                    revealed(group, index: index)
                } else if question.groups.count > 1 {
                    VStack(alignment: .leading, spacing: GPSpace.s8) {
                        Text(verbatim: TrainingText.blankLabel(index)).gpText(GPType.footnote)
                            .foregroundStyle(Color(.textSecondary)).accessibilityLabel("Пропуск \(index + 1)")
                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: GPSpace.s8) { chips(group, index: index) }
                            VStack(alignment: .leading, spacing: GPSpace.s8) { chips(group, index: index) }
                        }
                    }
                } else {
                    VStack(spacing: GPSpace.s8) {
                        ForEach(group.options, id: \.id) { option in
                            Button {
                                onSelect(option.id)
                            } label: {
                                optionRow(option, mark: screen.selection.contains(option.id) ? .selected : .none)
                            }.buttonStyle(PressScaleStyle())
                                .accessibilityLabel(Text(verbatim: "\(option.id), \(option.text)"))
                                .accessibilityValue(
                                    screen.selection.contains(option.id) ? Text("Выбран") : Text("Не выбран")
                                )
                                .accessibilityAddTraits(screen.selection.contains(option.id) ? .isSelected : [])
                                .accessibilityIdentifier("option.\(option.id)")
                        }
                    }
                }
            }
        }.foregroundStyle(Color(.text)).frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var heading: some View {
        Text(verbatim: TrainingText.typeLabel(question)).gpText(GPType.footnote)
            .foregroundStyle(section.color).accessibilityAddTraits(.isHeader)
        if let onReport {
            Button("Сообщить об ошибке", action: onReport).gpText(GPType.footnote)
                .buttonStyle(.plain).foregroundStyle(Color(.textSecondary))
                .frame(minHeight: GPSize.tapTarget).accessibilityIdentifier("question.report")
        }
    }

    func prompt(scale: CGFloat) -> AttributedString {
        let chosen = screen.revealed ? question.answer : screen.selection
        var text = AttributedString()
        for part in TrainingText.promptParts(question) {
            guard case let .blank(index) = part else {
                if case let .text(literal) = part { text.append(AttributedString(literal)) }
                continue
            }
            let many = question.groups.count > 1
            if many {
                var label = AttributedString(TrainingText.blankLabel(index) + " ")
                label.foregroundColor = Color(.textSecondary)
                label.font = .gp(GPType.key, scale: scale)
                text.append(label)
            }
            let option =
                question.groups.indices.contains(index)
                ? question.groups[index].options.first { chosen.contains($0.id) } : nil
            var blank = AttributedString(many ? option?.text ?? "_______" : "_______")
            blank.foregroundColor = many && option != nil ? section.color : Color(.textSecondary)
            text.append(blank)
        }
        return text
    }
    var spokenPrompt: String {
        let chosen = screen.revealed ? question.answer : screen.selection
        return TrainingText.promptParts(question).map { part in
            switch part {
            case let .text(literal): return literal
            case let .blank(index):
                let option = question.groups[index].options.first { chosen.contains($0.id) }
                return " " + (option?.text ?? String(localized: "Пропуск \(index + 1)")) + " "
            }
        }.joined()
    }

    private var quantities: some View {
        VStack(spacing: GPSpace.s16) {
            if let condition = question.condition {
                Text(verbatim: condition).gpText(GPType.prompt).multilineTextAlignment(.center)
                    .accessibilityIdentifier("question.condition")
            }
            HStack(alignment: .top, spacing: GPSpace.s12) {
                quantity("Величина A", value: question.quantityA ?? "")
                quantity("Величина B", value: question.quantityB ?? "")
            }
        }.frame(maxWidth: .infinity)
    }
    private func quantity(_ label: LocalizedStringKey, value: String) -> some View {
        VStack(spacing: GPSpace.s8) {
            Text(label).gpText(GPType.footnote).foregroundStyle(Color(.textSecondary))
            Text(verbatim: value).gpText(GPType.headline).fixedSize(horizontal: false, vertical: true)
        }.multilineTextAlignment(.center).frame(maxWidth: .infinity).padding(GPSpace.s16)
            .background(Color(.surface), in: RoundedRectangle(cornerRadius: GPRadius.xl))
            .accessibilityElement(children: .combine)
    }

    private func chips(_ group: Components.Schemas.OptionGroup, index: Int) -> some View {
        ForEach(group.options, id: \.id) { option in
            let selected = screen.selection.contains(option.id)
            Button {
                onSelect(option.id)
            } label: {
                Text(verbatim: option.text).gpText(GPType.callout).fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, GPSpace.s14).padding(.vertical, GPSpace.s8)
                    .frame(minHeight: GPSize.tapTarget)
                    .background(
                        selected ? section.tint : Color(.surface), in: RoundedRectangle(cornerRadius: GPRadius.lg)
                    )
                    .overlay {
                        if selected {
                            RoundedRectangle(cornerRadius: GPRadius.lg).stroke(
                                section.color, lineWidth: GPSize.hairline)
                        }
                    }
            }.buttonStyle(PressScaleStyle())
                .accessibilityLabel("Пропуск \(index + 1), \(option.text)")
                .accessibilityValue(selected ? Text("Выбран") : Text("Не выбран"))
                .accessibilityAddTraits(selected ? .isSelected : [])
                .accessibilityIdentifier("option.\(option.id)")
        }
    }

    private enum Mark { case none, selected, correct, wrong }
    private func optionRow(_ option: Components.Schemas.QuestionOption, mark: Mark) -> some View {
        HStack(spacing: GPSpace.s12) {
            Text(verbatim: option.id).gpText(GPType.footnote).fontWeight(.semibold)
                .frame(minWidth: GPSize.stepNode, minHeight: GPSize.stepNode)
                .foregroundStyle(
                    mark == .selected ? Color(.surface) : mark == .correct ? section.color : Color(.textSecondary)
                )
                .background(
                    mark == .selected ? section.color : mark == .correct ? Color(.surface) : Color(.fill), in: Capsule()
                )
            Text(verbatim: option.text).gpText(GPType.body).frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            if mark == .correct || mark == .wrong {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: GPSpace.s8) { markLabel(mark) }
                    VStack(spacing: GPSpace.s4) { markLabel(mark) }
                }.foregroundStyle(mark == .correct ? section.color : Color(.wrong))
            }
        }.frame(minHeight: GPSize.row).padding(.horizontal, GPSpace.s12).padding(.vertical, GPSpace.s8)
            .background(
                mark == .selected || mark == .correct ? section.tint : Color(.surface),
                in: RoundedRectangle(cornerRadius: GPRadius.lg)
            )
            .overlay {
                if mark == .selected {
                    RoundedRectangle(cornerRadius: GPRadius.lg).stroke(section.color, lineWidth: GPSize.hairline)
                }
            }
    }
    @ViewBuilder private func markLabel(_ mark: Mark) -> some View {
        Text(mark == .correct ? "верный" : "ваш ответ").gpText(GPType.footnote)
        Image(systemName: mark == .correct ? "checkmark.circle.fill" : "xmark.circle.fill").accessibilityHidden(true)
    }

    private func revealed(_ group: Components.Schemas.OptionGroup, index: Int) -> some View {
        VStack(alignment: .leading, spacing: GPSpace.s8) {
            if question.groups.count > 1 {
                Text(verbatim: TrainingText.blankLabel(index)).gpText(GPType.footnote).foregroundStyle(
                    Color(.textSecondary))
            }
            ForEach(
                group.options.filter { question.answer.contains($0.id) || screen.selection.contains($0.id) }, id: \.id
            ) { option in
                VStack(alignment: .leading, spacing: GPSpace.s4) {
                    optionRow(option, mark: question.answer.contains(option.id) ? .correct : .wrong)
                    if question.answer.contains(option.id), screen.selection.contains(option.id) {
                        Text("ваш ответ").gpText(GPType.footnote).foregroundStyle(section.color)
                            .padding(.horizontal, GPSpace.s12)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(verbatim: "\(option.id), \(option.text)"))
                .accessibilityValue(
                    Text(
                        verbatim: [
                            question.answer.contains(option.id) ? String(localized: "верный") : "",
                            screen.selection.contains(option.id) ? String(localized: "ваш ответ") : "",
                        ].filter { !$0.isEmpty }.joined(separator: ", ")))
            }
            let rest = group.options.filter { !question.answer.contains($0.id) && !screen.selection.contains($0.id) }
            if !rest.isEmpty {
                Text(verbatim: rest.map { "\($0.id) \($0.text)" }.joined(separator: "   "))
                    .gpText(GPType.subhead).foregroundStyle(Color(.textSecondary)).padding(.horizontal, GPSpace.s12)
                    .accessibilityLabel("Остальные варианты: \(rest.map(\.text).joined(separator: ", "))")
            }
        }
    }
}

struct SessionExplanation: View {
    @Bindable var model: SessionModel
    let screen: SessionModel.Screen
    @Environment(\.locale) private var locale
    @ScaledMetric(relativeTo: .title) private var nodeSize = GPSize.stepNode
    private var english: Bool { model.english ?? (locale.language.languageCode?.identifier == "en") }

    var body: some View {
        let chosen = screen.selection
        let q = screen.question
        let correct = !chosen.isEmpty && TrainingRules.isCorrect(q, chosen)
        let wrong = q.explanation.options.filter { chosen.contains($0.optionId) && !q.answer.contains($0.optionId) }
        HStack(alignment: .top, spacing: GPSpace.s14) {
            Image(systemName: correct ? "checkmark.circle.fill" : "xmark.circle.fill")
                .gpText(GPType.title2).foregroundStyle(correct ? StudySection(q.section).color : Color(.wrong))
                .frame(width: nodeSize, height: nodeSize)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: GPSpace.s12) {
                Text(verbatim: TrainingText.verdict(q, chosen: chosen, english: english)).gpText(GPType.body)
                    .fontWeight(.semibold).accessibilityAddTraits(.isHeader).accessibilityIdentifier(
                        "explanation.verdict")
                rich(english ? q.explanation.solution.en : q.explanation.solution.ru).gpText(GPType.bodyLong)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("explanation.solution")
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: GPSpace.s8) { controls(wrongAvailable: !wrong.isEmpty) }
                    VStack(alignment: .leading, spacing: GPSpace.s8) { controls(wrongAvailable: !wrong.isEmpty) }
                }
                if model.whyNotOpen {
                    ForEach(wrong, id: \.optionId) { explanation in
                        rich(english ? explanation.text.en : explanation.text.ru).gpText(GPType.subhead)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(GPSpace.s16)
                            .background(Color(.surface), in: RoundedRectangle(cornerRadius: GPRadius.xl))
                            .accessibilityIdentifier("explanation.whyNot")
                    }
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.background(alignment: .leading) {
            // Нить продолжает узел до конца разбора; фон получает его готовую высоту и не растягивает текст.
            VStack(spacing: GPSpace.s4) {
                Color.clear.frame(height: nodeSize)
                Rectangle().fill(Color(.line)).frame(width: GPSize.stepLine)
            }.frame(width: nodeSize).accessibilityHidden(true)
        }.foregroundStyle(Color(.text)).accessibilityElement(children: .contain).accessibilityIdentifier("explanation")
    }

    @ViewBuilder private func controls(wrongAvailable: Bool) -> some View {
        if wrongAvailable {
            let words = screen.question.groups.flatMap(\.options)
                .filter { screen.selection.contains($0.id) && !screen.question.answer.contains($0.id) }
                .map(\.text).joined(separator: ", ")
            Button {
                model.whyNotOpen.toggle()
            } label: {
                HStack(spacing: GPSpace.s6) {
                    Text(verbatim: english ? "Why not \(words)?" : "Почему не \(words)?").gpText(GPType.subhead)
                    Image(systemName: model.whyNotOpen ? "chevron.up" : "chevron.down").accessibilityHidden(true)
                }.padding(.horizontal, GPSpace.s16).frame(minHeight: GPSize.tapTarget)
                    .background(Color(.fill), in: Capsule())
            }.buttonStyle(PressScaleStyle())
                .accessibilityValue(model.whyNotOpen ? Text("Развёрнуто") : Text("Свёрнуто"))
                .accessibilityIdentifier("explanation.whyNotToggle")
        }
        Picker("Язык разбора", selection: Binding(get: { english }, set: { model.english = $0 })) {
            Text(verbatim: "RU").tag(false)
            Text(verbatim: "EN").tag(true)
        }.pickerStyle(.segmented).labelsHidden().fixedSize().accessibilityIdentifier("explanation.language")
    }

    private func rich(_ text: String) -> Text {
        // Разметка договора ограничена курсивом; пользовательский HTML сюда не попадает.
        Text(TrainingText.explanation(text))
    }
}
