import SwiftUI

struct TrainingReviewView: View {
    @Bindable var model: ReviewModel
    @State private var opened: Int?
    @State private var reportPosition: Int?
    @FocusState private var keyboardFocus: Bool

    var body: some View {
        GeometryReader { geometry in
            let wide = geometry.size.width >= GPLayout.breakpointWide
            Group {
                if let t = model.training {
                    ScrollView {
                        Group {
                            if wide {
                                HStack(alignment: .top, spacing: GPSpace.s32) {
                                    list(t, wide: true).frame(maxWidth: GPLayout.contentMax / 2)
                                    if let p = model.selectedPosition, let screen = model.screen(p) {
                                        ReviewQuestionView(
                                            screen: screen, trainings: model.trainings, onReport: { reportPosition = p }
                                        )
                                        .id(p).frame(maxWidth: GPLayout.contentMax)
                                    }
                                }.frame(maxWidth: GPLayout.contentMax * 1.5, alignment: .leading)
                            } else {
                                list(t, wide: false).frame(maxWidth: GPLayout.contentMax)
                            }
                        }.padding(GPLayout.gutter).frame(maxWidth: .infinity, alignment: .top)
                    }.scrollBounceBehavior(.basedOnSize)
                        .background { SectionGlow(section: StudySection(t.session.section)) }
                        .navigationTitle(t.isCheck ? Text("Разбор проверки") : Text("Разбор тренировки"))
                } else {
                    ContentUnavailableView("Тренировки нет на устройстве", systemImage: "tray")
                }
            }
            .navigationDestination(isPresented: Binding(get: { opened != nil }, set: { if !$0 { opened = nil } })) {
                if let p = opened, let screen = model.screen(p) {
                    TrainingReviewItemView(screen: screen, trainings: model.trainings, onReport: { reportPosition = p })
                }
            }
        }
        #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
        #endif
        .sheet(isPresented: Binding(get: { reportPosition != nil }, set: { if !$0 { reportPosition = nil } })) {
            if let p = reportPosition {
                QuestionReportView(model: QuestionReportModel(id: model.id, position: p, trainings: model.trainings))
            }
        }
        .focusable().focusEffectDisabled().focused($keyboardFocus)
        .onKeyPress(.upArrow) {
            guard reportPosition == nil, opened == nil else { return .ignored }
            model.moveSelection(-1)
            return .handled
        }
        .onKeyPress(.downArrow) {
            guard reportPosition == nil, opened == nil else { return .ignored }
            model.moveSelection(1)
            return .handled
        }
        .onKeyPress(.return) {
            guard reportPosition == nil, opened == nil, let p = model.selectedPosition else { return .ignored }
            opened = p
            return .handled
        }
        .onAppear {
            #if os(macOS)
                keyboardFocus = true
            #endif
        }
        .accessibilityElement(children: .contain).accessibilityIdentifier("review")
    }

    private func list(_ t: StoredTraining, wide: Bool) -> some View {
        VStack(alignment: .leading, spacing: GPSpace.s16) {
            let result = TrainingRules.result(t)
            Text("\(result.correct) \(TrainingCopy.correctOf(result.total))").gpText(GPType.subhead)
                .foregroundStyle(Color(.textSecondary))
            Picker("Показать", selection: $model.onlyMistakes) {
                Text("Все · \(t.total)").tag(false).accessibilityIdentifier("review.filter.all")
                Text("Ошибки · \(model.mistakes.count)").tag(true).accessibilityIdentifier("review.filter.mistakes")
            }.pickerStyle(.segmented).labelsHidden().accessibilityIdentifier("review.filter")
            if model.positions.isEmpty {
                Text("Ошибок нет.").gpText(GPType.body).accessibilityIdentifier("review.noMistakes")
            }
            LazyVStack(spacing: GPSpace.s4) {
                ForEach(model.positions, id: \.self) { p in
                    let q = t.session.items[p].question
                    let outcome = ReviewModel.outcome(t, position: p)
                    Button {
                        model.selected = p
                        if !wide { opened = p }
                    } label: {
                        HStack(spacing: GPSpace.s14) {
                            Text(p + 1, format: .number).gpText(GPType.footnote).monospacedDigit()
                                .frame(minWidth: GPSize.stepNode, minHeight: GPSize.stepNode)
                                .background(
                                    outcome == .wrong ? Color(.wrongTint) : StudySection(q.section).tint, in: Circle())
                            VStack(alignment: .leading, spacing: GPSpace.s4) {
                                Text(verbatim: TrainingText.typeLabel(q)).gpText(GPType.body)
                                Text(verbatim: q.topicTitle.localized).gpText(GPType.subhead).foregroundStyle(
                                    Color(.textSecondary))
                                Text(outcome.label).gpText(GPType.footnote)
                                    .foregroundStyle(outcome == .wrong ? Color(.wrong) : Color(.textSecondary))
                            }.frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: "chevron.right").accessibilityHidden(true)
                        }.foregroundStyle(Color(.text)).padding(GPSpace.s12).frame(minHeight: GPSize.rowTall)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                wide && model.selectedPosition == p ? Color(.fill) : Color.clear,
                                in: RoundedRectangle(cornerRadius: GPRadius.lg))
                    }.buttonStyle(PressScaleStyle()).accessibilityElement(children: .combine)
                        .accessibilityLabel(
                            "Вопрос \(p + 1), \(String(localized: outcome.label)), \(TrainingText.typeLabel(q)), \(q.topicTitle.localized)"
                        )
                        .accessibilityAddTraits(wide && model.selectedPosition == p ? .isSelected : [])
                        .accessibilityIdentifier("review.item.\(p)")
                }
            }
        }.foregroundStyle(Color(.text)).accessibilityElement(children: .contain).accessibilityIdentifier("review.list")
    }
}

extension ReviewModel.Outcome {
    var label: LocalizedStringResource {
        switch self {
        case .correct: "верно"
        case .wrong: "неверно"
        case .unanswered: "без ответа"
        }
    }
}

struct TrainingReviewItemView: View {
    let screen: SessionModel.Screen
    let trainings: TrainingModel
    var onReport: () -> Void = {}
    var body: some View {
        ScrollView {
            ReviewQuestionView(screen: screen, trainings: trainings, onReport: onReport)
                .frame(maxWidth: GPLayout.contentMax).padding(GPLayout.gutter).frame(maxWidth: .infinity)
        }.scrollBounceBehavior(.basedOnSize)
            .background { SectionGlow(section: StudySection(screen.training.session.section)) }
            .navigationTitle(Text("Вопрос \(screen.position + 1)"))
            #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
            #endif
    }
}

struct ReviewQuestionView: View {
    let screen: SessionModel.Screen
    @State private var explanation: SessionModel
    var onReport: () -> Void
    init(screen: SessionModel.Screen, trainings: TrainingModel, onReport: @escaping () -> Void = {}) {
        self.screen = screen
        _explanation = State(initialValue: SessionModel(id: screen.training.id, trainings: trainings))
        self.onReport = onReport
    }
    var body: some View {
        VStack(alignment: .leading, spacing: GPSpace.s24) {
            Text("Вопрос \(screen.position + 1)").gpText(GPType.title3).accessibilityAddTraits(.isHeader)
            if screen.selection.isEmpty {
                Text("без ответа").gpText(GPType.subhead).foregroundStyle(Color(.textSecondary))
            }
            SessionQuestion(screen: screen, onSelect: { _ in }, onReport: onReport)
            SessionExplanation(model: explanation, screen: screen)
        }.accessibilityElement(children: .contain).accessibilityIdentifier("reviewItem")
    }
}

struct QuestionReportView: View {
    @State var model: QuestionReportModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.textScale) private var textScale
    @ScaledMetric(relativeTo: .callout) private var kindWidth = GPSize.rowTall * 2
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: GPSpace.s16) {
                    if model.sent {
                        Text("Спасибо!").gpText(GPType.title3).accessibilityIdentifier("report.sent")
                        Text("Проверим вручную и поправим задание.").gpText(GPType.body)
                    } else if let q = model.question {
                        Text("Вопрос \(model.position + 1) · \(TrainingText.typeLabel(q))").gpText(GPType.subhead)
                            .foregroundStyle(Color(.textSecondary))
                        Text("Где ошибка").gpText(GPType.headline).accessibilityAddTraits(.isHeader)
                        LazyVGrid(
                            columns: [GridItem(.adaptive(minimum: kindWidth * textScale), spacing: GPSpace.s8)],
                            spacing: GPSpace.s8
                        ) {
                            ForEach(ReportKind.allCases, id: \.self) { kind in
                                Button {
                                    model.setKind(kind)
                                } label: {
                                    Text(kind.label).gpText(GPType.callout).fixedSize(horizontal: false, vertical: true)
                                        .padding(.horizontal, GPSpace.s12).padding(.vertical, GPSpace.s8)
                                        .frame(maxWidth: .infinity, minHeight: GPSize.tapTarget)
                                        .foregroundStyle(model.draft.kind == kind ? Color(.onAccent) : Color(.text))
                                        .background(
                                            model.draft.kind == kind ? Color(.accent) : Color(.surface), in: Capsule())
                                }.buttonStyle(PressScaleStyle()).accessibilityAddTraits(
                                    model.draft.kind == kind ? .isSelected : []
                                )
                                .accessibilityIdentifier("report.kind.\(kind.rawValue)")
                            }
                        }
                        Text("Что не так").gpText(GPType.headline)
                        TextField(
                            "Что не так", text: Binding(get: { model.draft.text }, set: model.setText),
                            prompt: Text("Что не так").foregroundStyle(Color(.textSecondary)), axis: .vertical
                        )
                        .lineLimit(4...8).gpText(GPType.body).textFieldStyle(.plain)
                        .padding(GPSpace.s14).frame(minHeight: GPSize.rowTall * 2, alignment: .topLeading)
                        .background(Color(.surface), in: RoundedRectangle(cornerRadius: GPRadius.xl))
                        .overlay {
                            RoundedRectangle(cornerRadius: GPRadius.xl).stroke(Color(.line), lineWidth: GPSize.hairline)
                        }
                        .accessibilityIdentifier("report.text")
                        Text("\(model.draft.length) / \(QuestionReportDraft.maxLength)").gpText(GPType.footnote)
                            .monospacedDigit()
                            .foregroundStyle(
                                model.draft.length > QuestionReportDraft.maxLength
                                    ? Color(.wrong) : Color(.textSecondary)
                            )
                            .accessibilityLabel("\(model.draft.length) из \(QuestionReportDraft.maxLength) символов")
                            .accessibilityIdentifier("report.length")
                        if model.draft.length > QuestionReportDraft.maxLength {
                            Text("Сократите текст до 2000 символов.").gpText(GPType.footnote).foregroundStyle(
                                Color(.wrong))
                        }
                        Text("Проверим вручную и поправим задание.").gpText(GPType.footnote).foregroundStyle(
                            Color(.textSecondary))
                    }
                    if model.problem {
                        Text("Не получилось сохранить жалобу. Попробуйте ещё раз.").gpText(GPType.subhead)
                            .foregroundStyle(Color(.wrong)).accessibilityIdentifier("report.problem")
                    }
                }.frame(maxWidth: GPLayout.contentMax, alignment: .leading).padding(GPLayout.gutter).frame(
                    maxWidth: .infinity)
            }.background(Color(.bg)).scrollBounceBehavior(.basedOnSize)
                .safeAreaInset(edge: .bottom) {
                    if model.sent {
                        Button("Вернуться к вопросу") { dismiss() }.buttonStyle(PrimaryCapsuleStyle())
                            .accessibilityIdentifier("report.back").frame(maxWidth: GPLayout.contentMax).padding(
                                GPLayout.gutter
                            )
                            .frame(maxWidth: .infinity).background(Color(.bg))
                    } else {
                        Button(action: model.send) {
                            Text("Отправить").opacity(model.saving ? 0 : 1).overlay {
                                if model.saving { ProgressView() }
                            }
                        }.buttonStyle(PrimaryCapsuleStyle()).disabled(!model.canSend)
                            .accessibilityIdentifier("report.send").frame(maxWidth: GPLayout.contentMax).padding(
                                GPLayout.gutter
                            )
                            .frame(maxWidth: .infinity).background(Color(.bg))
                    }
                }
                .navigationTitle(Text("Сообщить об ошибке"))
                .toolbar {
                    if !model.sent {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Отмена") { model.cancel { dismiss() } }.disabled(model.saving)
                                .accessibilityIdentifier("report.cancel")
                        }
                    }
                }
                #if os(iOS)
                    .navigationBarTitleDisplayMode(.inline)
                #endif
        }.tint(Color(.accent))
            #if os(macOS)
                .frame(minWidth: GPLayout.contentMax, minHeight: GPSize.rowTall * 9)
            #endif
    }
}

extension ReportKind {
    var label: LocalizedStringResource {
        switch self {
        case .question: "В задании"
        case .answer: "В ответе"
        case .explanation: "В разборе"
        case .translation: "В переводе"
        case .other: "Другое"
        }
    }
}
