import Combine
import GPAPI
import GameController
import SwiftUI

/// Системная навигация сверху и одно главное действие снизу во всех состояниях сессии.
struct TrainingSessionView: View {
    @State private var model: SessionModel
    let onClose: () -> Void
    let onRepeat: (String) -> Void
    @Environment(\.scenePhase) private var scenePhase
    @FocusState private var keyboardFocus: Bool
    @State private var keyboardConnected = GCKeyboard.coalesced != nil
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    init(
        id: String, trainings: TrainingModel, onClose: @escaping () -> Void = {},
        onRepeat: @escaping (String) -> Void = { _ in }
    ) {
        _model = State(initialValue: SessionModel(id: id, trainings: trainings))
        self.onClose = onClose
        self.onRepeat = onRepeat
    }

    /// Снимки получают уже подготовленную модель и не запускают часы.
    init(model: SessionModel, onClose: @escaping () -> Void = {}, onRepeat: @escaping (String) -> Void = { _ in }) {
        _model = State(initialValue: model)
        self.onClose = onClose
        self.onRepeat = onRepeat
    }

    private var hasKeyboard: Bool {
        #if os(macOS)
            true
        #else
            keyboardConnected && UIDevice.current.userInterfaceIdiom == .pad
        #endif
    }

    var body: some View {
        GeometryReader { geometry in
            let wide = geometry.size.width >= GPLayout.breakpointWide
            Group {
                if let s = model.screen {
                    content(s, wide: wide)
                        .background { SectionGlow(section: StudySection(s.training.session.section)) }
                        .navigationTitle(
                            s.result == nil ? Text(StudySection(s.training.session.section).label) : Text("Итог")
                        )
                        .toolbar {
                            if s.result == nil {
                                ToolbarItem(placement: .principal) { SessionProgress(screen: s) }
                                if s.training.isCheck && !model.overview {
                                    ToolbarItemGroup(placement: .primaryAction) {
                                        Button(action: model.toggleFlag) {
                                            Label(
                                                s.flagged ? "Снять отметку" : "Отметить, чтобы вернуться",
                                                systemImage: s.flagged ? "flag.fill" : "flag")
                                        }.accessibilityIdentifier("question.flag")
                                        Button(action: model.openOverview) {
                                            Label("Все вопросы", systemImage: "square.grid.3x3")
                                        }
                                        .accessibilityIdentifier("question.overview")
                                    }
                                }
                            }
                        }
                } else {
                    ContentUnavailableView(
                        "Тренировки нет на устройстве", systemImage: "tray",
                        description: Text("Она могла устареть. Начните новую с экрана «Сегодня».")
                    )
                    .background(Color(.bg))
                }
            }
        }
        #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
        #endif
        .focusable().focusEffectDisabled().focused($keyboardFocus)
        .onKeyPress(characters: CharacterSet(charactersIn: "abcdeABCDE"), phases: .down) { press in
            guard press.modifiers.intersection([.command, .control, .option]).isEmpty else { return .ignored }
            model.selectKey(press.characters)
            return .handled
        }
        .onKeyPress(keys: [.return], phases: .down) { press in
            guard press.modifiers.isEmpty else { return .ignored }
            primary()
            return .handled
        }
        .onKeyPress(keys: [.rightArrow], phases: .down) { press in
            guard press.modifiers.isEmpty, !model.overview else { return .ignored }
            model.next()
            return .handled
        }
        .onReceive(timer) { _ in if scenePhase == .active { model.tick() } }
        .onChange(of: scenePhase) { _, phase in if phase == .active { model.tick() } }
        .onReceive(NotificationCenter.default.publisher(for: .GCKeyboardDidConnect)) { _ in
            keyboardConnected = true
            keyboardFocus = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .GCKeyboardDidDisconnect)) { _ in keyboardConnected = false
        }
        .onAppear {
            model.tick()
            keyboardFocus = hasKeyboard
        }
        .accessibilityElement(children: .contain).accessibilityIdentifier("training.session")
    }

    private func content(_ s: SessionModel.Screen, wide: Bool) -> some View {
        ScrollView {
            Group {
                if let result = s.result {
                    SessionSummary(screen: s, result: result, wide: wide)
                } else if wide && (s.revealed || s.training.isCheck) {
                    HStack(alignment: .top, spacing: GPSpace.s32) {
                        SessionQuestion(screen: s, onSelect: model.select).frame(maxWidth: GPLayout.contentMax)
                        Group {
                            if s.revealed {
                                SessionExplanation(model: model, screen: s)
                            } else {
                                SessionOverview(model: model, screen: s)
                            }
                        }.frame(maxWidth: GPLayout.contentMax / 2)
                    }.frame(maxWidth: GPLayout.contentMax * 1.5, alignment: .top)
                } else if model.overview {
                    SessionOverview(model: model, screen: s).frame(maxWidth: GPLayout.contentMax)
                } else {
                    VStack(alignment: .leading, spacing: GPSpace.s24) {
                        SessionQuestion(screen: s, onSelect: model.select)
                        if s.revealed { SessionExplanation(model: model, screen: s) }
                    }.frame(maxWidth: GPLayout.contentMax)
                }
            }.padding(GPLayout.gutter).frame(maxWidth: .infinity, alignment: .top)
        }.scrollBounceBehavior(.basedOnSize)
            .safeAreaInset(edge: .bottom) {
                actions(s).frame(maxWidth: GPLayout.contentMax).padding(.horizontal, GPLayout.gutter)
                    .padding(.vertical, GPSpace.s12).frame(maxWidth: .infinity).background(Color(.bg))
            }
            // Новый вопрос начинается сверху; разбор добавляется рядом с условием без принудительной прокрутки.
            .id(s.result != nil ? "summary" : model.overview ? "overview" : "question-\(s.position)")
    }

    private func actions(_ s: SessionModel.Screen) -> some View {
        VStack(spacing: GPSpace.s8) {
            if let problem = model.repeatProblem {
                Text(problem.message).gpText(GPType.footnote).foregroundStyle(Color(.textSecondary))
                    .accessibilityIdentifier("summary.problem")
            }
            if s.result == nil, !s.revealed, !model.overview {
                if s.training.isCheck {
                    Text("Разбор — после последнего вопроса").gpText(GPType.footnote).foregroundStyle(
                        Color(.textSecondary))
                } else if let note = TrainingText.missing(s) {
                    Text(verbatim: note).gpText(GPType.footnote).foregroundStyle(Color(.textSecondary))
                        .accessibilityIdentifier("session.note")
                }
            }
            if hasKeyboard {
                Group {
                    if let result = s.result {
                        Text(result.review.isEmpty ? "Enter — готово" : "Enter — повторить")
                    } else if model.overview {
                        Text("Enter — закончить")
                    } else if s.revealed {
                        Text("Enter / → — дальше")
                    } else {
                        Text("A–E — выбрать · Enter — проверить / дальше · → — дальше")
                    }
                }.gpText(GPType.key).foregroundStyle(Color(.textSecondary)).accessibilityIdentifier("session.keys")
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: GPSpace.s12) { buttons(s) }
                VStack(spacing: GPSpace.s8) { buttons(s) }
            }
        }
    }

    @ViewBuilder private func buttons(_ s: SessionModel.Screen) -> some View {
        if let result = s.result {
            if result.review.isEmpty {
                Button("Готово", action: onClose).buttonStyle(PrimaryCapsuleStyle()).accessibilityIdentifier(
                    "summary.done")
            } else {
                secondary("Готово", id: "summary.done", action: onClose)
                Button {
                    Task { if let id = await model.repeatMistakes() { onRepeat(id) } }
                } label: {
                    Text(
                        "Повторить · \(TrainingCopy.questions(TrainingRules.repeatCount(result.review.reduce(0) { $0 + $1.mistakes })))"
                    )
                    .opacity(model.startingRepeat ? 0 : 1).overlay {
                        if model.startingRepeat { ProgressView().tint(Color(.onAccent)) }
                    }
                }.buttonStyle(PrimaryCapsuleStyle()).disabled(model.startingRepeat).accessibilityIdentifier(
                    "summary.repeat")
            }
        } else if model.overview {
            secondary(
                LocalizedStringKey("К вопросу \(s.position + 1)"), id: "overview.back", action: model.closeOverview)
            Button("Закончить", action: model.end).buttonStyle(PrimaryCapsuleStyle()).accessibilityIdentifier(
                "overview.finish")
        } else if s.training.isCheck || s.revealed {
            if s.training.isCheck { secondary("Пропустить", id: "question.skip", action: model.next) }
            Button(action: model.next) {
                if s.isLast {
                    Text(s.training.isCheck ? "К списку вопросов" : "Итог")
                } else {
                    Text("Дальше · \(s.position + 2) из \(s.training.total)")
                }
            }.buttonStyle(PrimaryCapsuleStyle()).accessibilityIdentifier("question.next")
        } else {
            secondary("Не знаю", id: "question.dontKnow", action: model.dontKnow)
            Button("Проверить", action: model.check).buttonStyle(PrimaryCapsuleStyle())
                .disabled(!s.canCheck).accessibilityIdentifier("question.check")
        }
    }

    private func secondary(_ title: LocalizedStringKey, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).gpText(GPType.callout).fixedSize(horizontal: false, vertical: true)
        }
        .buttonStyle(.bordered).buttonBorderShape(.capsule).controlSize(.large)
        .frame(minHeight: GPSize.button).accessibilityIdentifier(id)
    }

    private func primary() {
        guard let s = model.screen else { return }
        if let result = s.result {
            if result.review.isEmpty {
                onClose()
            } else {
                Task { if let id = await model.repeatMistakes() { onRepeat(id) } }
            }
        } else if model.overview {
            model.end()
        } else if s.training.isCheck || s.revealed {
            model.next()
        } else {
            model.check()
        }
    }
}

struct SessionProgress: View {
    let screen: SessionModel.Screen
    var body: some View {
        HStack(spacing: GPSpace.s8) {
            if let remaining = screen.remaining {
                Image(systemName: "timer").accessibilityHidden(true)
                Text(verbatim: String(format: "%d:%02d", remaining / 60, remaining % 60)).gpText(GPType.timer)
                    .accessibilityLabel("Осталось \(remaining / 60) минут \(remaining % 60) секунд")
                    .accessibilityIdentifier("session.timer")
            }
            Text("\(screen.position + 1) из \(screen.training.total)").gpText(GPType.footnote)
                .foregroundStyle(Color(.textSecondary)).accessibilityLabel(
                    "Вопрос \(screen.position + 1) из \(screen.training.total)"
                )
                .accessibilityIdentifier("session.progress")
        }.monospacedDigit()
    }
}

struct SessionOverview: View {
    let model: SessionModel
    let screen: SessionModel.Screen
    private var section: StudySection { StudySection(screen.training.session.section) }
    var body: some View {
        VStack(alignment: .leading, spacing: GPSpace.s16) {
            Text("Все вопросы").gpText(GPType.title3).accessibilityAddTraits(.isHeader)
            let answered = screen.training.answers.values.filter { !$0.optionIds.isEmpty }.count
            let flagged = screen.training.answers.values.filter(\.flagged).count
            Text("Отвечено \(answered) из \(screen.training.total) · отмечено \(flagged)").gpText(GPType.subhead)
                .foregroundStyle(Color(.textSecondary)).accessibilityIdentifier("overview.status")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: GPSize.rowTall), spacing: GPSpace.s8)], spacing: GPSpace.s8)
            {
                ForEach(0..<screen.training.total, id: \.self) { index in
                    let answer = screen.training.answers[index]
                    let answered = !(answer?.optionIds.isEmpty ?? true)
                    let flagged = answer?.flagged == true
                    Button {
                        model.goTo(index)
                    } label: {
                        VStack(spacing: GPSpace.s4) {
                            Text(index + 1, format: .number).gpText(GPType.headline)
                            if flagged {
                                Image(systemName: "flag.fill").font(.gp(GPType.key))
                            } else if answered {
                                Image(systemName: "checkmark").font(.gp(GPType.key))
                            }
                        }.frame(maxWidth: .infinity, minHeight: GPSize.rowTall).padding(.vertical, GPSpace.s4)
                            .foregroundStyle(answered ? section.color : Color(.text))
                            .background(
                                answered ? section.tint : Color(.surface),
                                in: RoundedRectangle(cornerRadius: GPRadius.lg)
                            )
                            .overlay {
                                if screen.position == index {
                                    RoundedRectangle(cornerRadius: GPRadius.lg).stroke(
                                        section.color, lineWidth: GPSize.hairline)
                                }
                            }
                    }.buttonStyle(PressScaleStyle()).accessibilityLabel("Вопрос \(index + 1)")
                        .accessibilityValue(
                            Text(
                                verbatim: [
                                    answered ? String(localized: "отвечен") : String(localized: "без ответа"),
                                    flagged ? String(localized: "отмечен") : "",
                                ].filter { !$0.isEmpty }.joined(separator: ", "))
                        )
                        .accessibilityIdentifier("overview.question.\(index)")
                }
            }
        }.foregroundStyle(Color(.text)).accessibilityElement(children: .contain).accessibilityIdentifier("overview")
    }
}

struct SessionSummary: View {
    let screen: SessionModel.Screen
    let result: Components.Schemas.TrainingSummary
    let wide: Bool
    private var section: StudySection { StudySection(screen.training.session.section) }
    var body: some View {
        VStack(alignment: .leading, spacing: GPSpace.s24) {
            HStack(alignment: .firstTextBaseline, spacing: GPSpace.s12) {
                Text(result.correct, format: .number).gpText(wide ? GPType.displayWide : GPType.display)
                    .accessibilityIdentifier("summary.correct")
                Text("верно из \(result.total)").gpText(GPType.title3)
            }.accessibilityElement(children: .combine)
            Text(verbatim: summaryLine).gpText(GPType.subhead).foregroundStyle(Color(.textSecondary))
            if screen.training.finish?.timedOut == true {
                Label("Время вышло — неотвеченные не считаются ошибками темы.", systemImage: "timer").gpText(
                    GPType.subhead)
                if result.unanswered > 0 {
                    Text("Не успел · \(TrainingCopy.questions(result.unanswered))").gpText(GPType.body)
                        .accessibilityIdentifier("summary.unanswered")
                }
            }
            if result.review.isEmpty {
                Text(
                    result.unanswered > 0
                        ? "Ошибок нет, но остались вопросы без ответа." : "Без ошибок — повторять нечего."
                )
                .gpText(GPType.body).accessibilityIdentifier("summary.noMistakes")
            } else {
                Text("Что повторить").gpText(GPType.title3).accessibilityAddTraits(.isHeader)
                ForEach(result.review, id: \.topicId) { topic in
                    HStack(alignment: .top, spacing: GPSpace.s12) {
                        Circle().fill(section.color).frame(width: GPSpace.s8, height: GPSpace.s8).padding(
                            .top, GPSpace.s8
                        ).accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: GPSpace.s4) {
                            Text(verbatim: topic.title.localized).gpText(GPType.headline)
                            let places = topic.positions.map { String($0 + 1) }.joined(separator: ", ")
                            let location =
                                topic.positions.count == 1
                                ? String(localized: "вопрос \(places)") : String(localized: "вопросы \(places)")
                            Text("\(TrainingCopy.mistakes(topic.mistakes)) · \(location)")
                                .gpText(GPType.subhead).foregroundStyle(Color(.textSecondary))
                        }
                    }.accessibilityElement(children: .combine)
                }
            }
        }.foregroundStyle(Color(.text)).frame(maxWidth: GPLayout.contentMax, alignment: .leading)
            .accessibilityElement(children: .contain).accessibilityIdentifier("summary")
    }
    private var summaryLine: String {
        let t = screen.training
        let time = TrainingRules.summaryMinutes(
            result.durationSeconds, limit: t.isCheck ? t.session.timeLimitSeconds : nil)
        let duration = String(localized: "\(time.minutes) минут").replacingOccurrences(of: " ", with: "\u{00A0}")
        let section = String(localized: section.label)
        if let limit = time.limit {
            return String(localized: "Проверка") + " · " + section + " · "
                + String(localized: "\(duration) из \(limit)")
        }
        return ([section] + t.session.questionTypes.map(\.label) + [duration]).joined(separator: " · ")
    }
}

extension BuilderModel.Problem {
    var message: LocalizedStringKey {
        switch self {
        case .noQuestions: "Под этот выбор заданий пока нет — попробуйте другие темы или сложность."
        case .offline: "Нет сети — тренировку не начать. Попробуйте, когда она появится."
        case .failed: "Не получилось начать тренировку. Попробуйте ещё раз."
        }
    }
}
