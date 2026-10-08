import GPAPI
import SwiftUI

/// Названия GRE не переводятся; тексты режима и сложности совпадают с Android.
extension Components.Schemas.QuestionType {
    var label: String {
        switch self {
        case .textCompletion: "Text Completion"
        case .sentenceEquivalence: "Sentence Equivalence"
        case .quantitativeComparison: "Quantitative Comparison"
        case .multipleChoice: "Multiple Choice"
        }
    }
}
extension Components.Schemas.TrainingMode {
    var label: LocalizedStringResource { self == .practice ? "Практика" : "Проверка" }
    var hint: LocalizedStringResource {
        self == .practice ? "Разбор после каждого вопроса, без таймера" : "Таймер как на экзамене, разбор в конце"
    }
}
extension Components.Schemas.Difficulty {
    var label: LocalizedStringResource {
        switch self {
        case .easy: "Лёгкая"
        case .medium: "Средняя"
        case .hard: "Трудная"
        }
    }
}
extension Components.Schemas.LocalizedText {
    var localized: String { Locale.current.language.languageCode?.identifier == "en" ? en : ru }
}

enum TrainingEntry: Hashable {
    case builder(BuilderPrefill?)
    case session(String)
}

/// Тренировки заменяют вкладки целиком: системный стек ведёт внутрь задачи, «Сегодня» возвращает к разделам.
struct TrainingFlow: View {
    let trainings: TrainingModel
    let onClose: () -> Void
    @State private var builder: BuilderModel
    @State private var sessionID: String?
    @State private var topics = false

    init(entry: TrainingEntry, trainings: TrainingModel, onClose: @escaping () -> Void) {
        self.trainings = trainings
        self.onClose = onClose
        let prefill: BuilderPrefill?
        switch entry {
        case let .builder(value):
            prefill = value
            _sessionID = State(initialValue: nil)
        case let .session(id):
            prefill = nil
            _sessionID = State(initialValue: id)
        }
        _builder = State(initialValue: BuilderModel(trainings: trainings, prefill: prefill))
    }

    var body: some View {
        NavigationStack {
            Group {
                if let sessionID {
                    TrainingSessionPlaceholder(trainings: trainings, id: sessionID)
                } else {
                    TrainingBuilderView(model: builder, onTopics: { topics = true }, onStarted: { sessionID = $0 })
                        .navigationDestination(isPresented: $topics) {
                            TrainingTopicsView(model: builder) { topics = false }
                        }
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: onClose) { Label("Сегодня", systemImage: "chevron.backward") }
                        .accessibilityIdentifier("training.close")
                }
            }
        }
        .tint(Color(.accent))
    }
}

struct TrainingBuilderView: View {
    let model: BuilderModel
    var loadsOnAppear = true
    var onTopics: () -> Void = {}
    var onStarted: (String) -> Void = { _ in }
    @Environment(AppModel.self) private var app
    @Environment(\.scenePhase) private var scenePhase
    @State private var countText: String

    init(
        model: BuilderModel, loadsOnAppear: Bool = true, onTopics: @escaping () -> Void = {},
        onStarted: @escaping (String) -> Void = { _ in }
    ) {
        self.model = model
        self.loadsOnAppear = loadsOnAppear
        self.onTopics = onTopics
        self.onStarted = onStarted
        _countText = State(initialValue: model.form.countText)
    }

    var body: some View {
        GeometryReader { geometry in
            let wide = geometry.size.width >= GPLayout.breakpointWide
            Group {
                switch model.content {
                case .loading:
                    VStack(spacing: GPSpace.s12) {
                        ProgressView()
                        Text("Загружаем темы").gpText(GPType.subhead)
                    }.frame(maxWidth: .infinity, maxHeight: .infinity).accessibilityIdentifier("builder.loading")
                case let .unavailable(problem): unavailable(problem)
                case .ready: ready(wide: wide)
                }
            }
            .background { SectionGlow(section: StudySection(model.form.section)) }
            .navigationTitle(wide ? Text("") : Text("Новая тренировка"))
        }
        #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
        #endif
        .task { if loadsOnAppear { await model.load() } }
        .onChange(of: countText) { _, text in
            guard text != model.form.countText else { return }
            model.setCount(text)
            // Прямая Binding с нормализацией оставляла третью цифру в нативном поле: модель уже равна
            // нормализованному значению, поэтому SwiftUI не обновляет его. Состояние поля меняется отдельно.
            countText = model.form.countText
        }
        .onChange(of: model.form.countText) { _, text in
            if countText != text { countText = text }
        }
        .onChange(of: app.network.isOnline) { _, online in
            if online, case .unavailable = model.content { Task { await model.load() } }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, case .unavailable = model.content { Task { await model.load() } }
        }
    }

    private func unavailable(_ problem: BuilderModel.Problem) -> some View {
        ContentUnavailableView {
            Label {
                Text(LocalizedStringKey(problem == .offline ? "Нет сети" : "Не получилось загрузить темы"))
            } icon: {
                Image(systemName: problem == .offline ? "wifi.slash" : "exclamationmark.triangle")
            }
            .gpText(GPType.title3)
        } description: {
            Text(
                LocalizedStringKey(
                    problem == .offline
                        ? "Чтобы начать тренировку, нужна сеть: задания скачаются целиком, и дальше можно без неё."
                        : "Мы уже знаем об ошибке. Попробуйте ещё раз чуть позже."))
        } actions: {
            Button("Повторить") { Task { await model.load() } }.buttonStyle(PrimaryCapsuleStyle()).fixedSize()
                .accessibilityIdentifier("builder.retry")
        }.accessibilityIdentifier("builder.unavailable")
    }

    private func ready(wide: Bool) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: GPSpace.s24) {
                if wide {
                    Text("Новая тренировка").gpText(GPType.title2Wide)
                    HStack(alignment: .top, spacing: GPSpace.s24) {
                        if !model.presets.isEmpty { presets.frame(maxWidth: .infinity) }
                        custom.frame(maxWidth: .infinity)
                    }
                } else {
                    if !model.presets.isEmpty { presets }
                    custom
                }
                if let problem = model.problem {
                    problemText(problem).gpText(GPType.subhead)
                        .foregroundStyle(Color(.textSecondary)).accessibilityIdentifier("builder.problem")
                }
                if wide {
                    startButton.fixedSize(horizontal: true, vertical: false).frame(
                        maxWidth: .infinity, alignment: .trailing)
                }
            }
            .frame(maxWidth: wide ? GPLayout.contentMax + GPLayout.sidebarMax : GPLayout.contentMax)
            .padding(GPLayout.gutter)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
        .safeAreaInset(edge: .bottom) {
            if !wide {
                startButton.padding(.horizontal, GPLayout.gutter).padding(.vertical, GPSpace.s12)
                    .frame(maxWidth: GPLayout.contentMax + GPLayout.gutter * 2).frame(maxWidth: .infinity)
                    .background(Color(.bg))
            }
        }
    }

    private var presets: some View {
        VStack(spacing: 0) {
            ForEach(Array(model.presets.enumerated()), id: \.offset) { index, preset in
                if index > 0 { Divider().overlay(Color(.line)).padding(.horizontal, GPSpace.s16) }
                Button {
                    model.selectPreset(index)
                } label: {
                    HStack(spacing: GPSpace.s16) {
                        VStack(alignment: .leading, spacing: GPSpace.s4) {
                            Text(LocalizedStringKey(preset.kind == "last" ? "Как в прошлый раз" : "Проверка на время"))
                                .gpText(
                                    GPType.headline)
                            Text(verbatim: presetSubtitle(preset)).gpText(GPType.subhead).foregroundStyle(
                                Color(.textSecondary)
                            )
                            .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: model.preset == index ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(model.preset == index ? Color(.text) : Color(.textSecondary))
                    }.frame(minHeight: GPSize.tapTarget).padding(GPSpace.s16).contentShape(Rectangle())
                }
                .buttonStyle(.plain).accessibilityAddTraits(model.preset == index ? .isSelected : [])
                .accessibilityIdentifier("builder.preset.\(preset.kind)")
            }
        }.background(Color(.surface), in: RoundedRectangle(cornerRadius: GPRadius.xxl))
    }

    private func presetSubtitle(_ preset: Components.Schemas.TrainingPreset) -> String {
        let r = preset.request
        let section = String(localized: StudySection(r.section).label)
        if preset.kind == "timed" {
            return String(
                localized:
                    "\(section) · \(TrainingCopy.questions(r.count)) · \(model.minutes(r)) мин, как секция экзамена")
        }
        return
            "\(section) · \(r.questionTypes.map(\.label).joined(separator: ", ")) · \(r.count) · \(String(localized: r.mode.label))"
    }

    private var custom: some View {
        VStack(spacing: 0) {
            field {
                Text("Раздел")
                Spacer()
                Picker("Раздел", selection: Binding(get: { model.form.section }, set: model.setSection)) {
                    Text("Verbal").tag(Components.Schemas.Section.verbal)
                    Text("Quant").tag(Components.Schemas.Section.quant)
                }.pickerStyle(.segmented).labelsHidden().fixedSize().accessibilityIdentifier("builder.section")
            }
            line
            field {
                Text("Тип")
                Spacer()
                Picker("Тип", selection: Binding(get: { model.form.type }, set: model.setType)) {
                    ForEach(model.types, id: \.questionType) { type in
                        Text(
                            verbatim: type.questionType.label
                                + (type.topics.isEmpty ? " · " + String(localized: "скоро") : "")
                        )
                        .tag(type.questionType)
                        .disabled(type.topics.isEmpty)
                    }
                }.labelsHidden().pickerStyle(.menu).accessibilityIdentifier("builder.type")
            }
            line
            field {
                Text("Вопросов")
                Spacer()
                TextField("Вопросов", text: $countText)
                    .textFieldStyle(.plain).multilineTextAlignment(.center).monospacedDigit()
                    .frame(width: GPSpace.s72 + GPSpace.s4, height: GPSize.tapTarget)
                    .background(Color(.fill), in: Capsule()).accessibilityIdentifier("builder.count")
                    #if os(iOS)
                        .keyboardType(.numberPad)
                    #endif
            }
            line
            VStack(alignment: .leading, spacing: GPSpace.s8) {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: GPSpace.s12) {
                        Text("Режим")
                        Spacer()
                        modes
                    }
                    VStack(alignment: .leading, spacing: GPSpace.s8) {
                        Text("Режим")
                        modes
                    }
                }
                Text(model.form.mode.hint).gpText(GPType.subhead).foregroundStyle(Color(.textSecondary))
                    .fixedSize(horizontal: false, vertical: true)
            }.padding(GPSpace.s16)
            line
            Button(action: onTopics) {
                HStack(spacing: GPSpace.s12) {
                    Text("Темы и сложность")
                    Spacer()
                    Text(verbatim: topicSummary).foregroundStyle(Color(.textSecondary))
                    Image(systemName: "chevron.forward").foregroundStyle(Color(.textSecondary))
                }.frame(minHeight: GPSize.row).contentShape(Rectangle())
            }.buttonStyle(.plain).padding(.horizontal, GPSpace.s16).accessibilityIdentifier("builder.topics")
        }
        .gpText(GPType.body)
        .foregroundStyle(Color(.text))
        .background(Color(.surface), in: RoundedRectangle(cornerRadius: GPRadius.xxl))
    }

    private var modes: some View {
        Picker("Режим", selection: Binding(get: { model.form.mode }, set: model.setMode)) {
            Text("Практика").tag(Components.Schemas.TrainingMode.practice)
            Text("Проверка").tag(Components.Schemas.TrainingMode.check)
        }.pickerStyle(.segmented).labelsHidden().fixedSize().accessibilityIdentifier("builder.mode")
    }
    private var topicSummary: String {
        let topics =
            model.form.topicIDs.map { String(localized: "\($0.count) из \(model.topics.count)") }
            ?? String(localized: "все")
        return model.form.difficulty.map { "\(topics) · \(String(localized: $0.label))" } ?? topics
    }
    private var line: some View { Divider().overlay(Color(.line)).padding(.horizontal, GPSpace.s16) }
    private func field(@ViewBuilder content: () -> some View) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: GPSpace.s12, content: content)
            VStack(alignment: .leading, spacing: GPSpace.s8, content: content)
        }.frame(minHeight: GPSize.row).padding(.horizontal, GPSpace.s16).padding(.vertical, GPSpace.s4)
    }
    private var startButton: some View {
        Button {
            // Задача приложения переживает исчезновение конструктора после нажатия.
            Task { if let id = await model.start() { onStarted(id) } }
        } label: {
            Group {
                if let r = model.request {
                    Text("Начать · \(TrainingCopy.questions(r.count)) · ~\(model.minutes(r)) мин")
                } else {
                    Text("Заданий пока нет")
                }
            }.opacity(model.starting ? 0 : 1).overlay { if model.starting { ProgressView().tint(Color(.onAccent)) } }
        }
        .buttonStyle(PrimaryCapsuleStyle()).opacity(model.request == nil ? 0.5 : 1)
        .disabled(model.starting || model.request == nil).keyboardShortcut(.defaultAction)
        .accessibilityIdentifier("builder.start")
    }
    @ViewBuilder private func problemText(_ problem: BuilderModel.Problem) -> some View {
        switch problem {
        case .noQuestions: Text("Под этот выбор заданий пока нет — попробуйте другие темы или сложность.")
        case .offline: Text("Нет сети — тренировку не начать. Попробуйте, когда она появится.")
        case .failed: Text("Не получилось начать тренировку. Попробуйте ещё раз.")
        }
    }
}

struct TrainingTopicsView: View {
    let model: BuilderModel
    var onDone: () -> Void = {}
    var body: some View {
        GeometryReader { geometry in
            let wide = geometry.size.width >= GPLayout.breakpointWide
            ScrollView {
                VStack(alignment: .leading, spacing: GPSpace.s24) {
                    if wide { Text("Темы и сложность").gpText(GPType.title2Wide) }
                    Text(
                        verbatim:
                            "\(String(localized: StudySection(model.form.section).label)) · \(model.form.type.label)"
                    )
                    .gpText(GPType.subhead).foregroundStyle(StudySection(model.form.section).color)
                    topics
                    difficulty
                    if wide {
                        done.fixedSize(horizontal: true, vertical: false).frame(
                            maxWidth: .infinity, alignment: .trailing)
                    }
                }.frame(maxWidth: GPLayout.contentMax)
                    .padding(GPLayout.gutter).frame(maxWidth: .infinity)
            }.scrollBounceBehavior(.basedOnSize)
                .safeAreaInset(edge: .bottom) {
                    if !wide {
                        done.padding(.horizontal, GPLayout.gutter).padding(.vertical, GPSpace.s12)
                            .frame(maxWidth: GPLayout.contentMax + GPLayout.gutter * 2).frame(maxWidth: .infinity)
                            .background(Color(.bg))
                    }
                }
                .background { SectionGlow(section: StudySection(model.form.section)) }
                .navigationTitle(wide ? Text("") : Text("Темы и сложность"))
        }
        #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
        #endif
    }
    private var topics: some View {
        VStack(spacing: 0) {
            ForEach(Array(model.topics.enumerated()), id: \.element.id) { index, topic in
                if index > 0 { Divider().overlay(Color(.line)) }
                Toggle(
                    isOn: Binding(
                        get: { model.form.topicIDs?.contains(topic.id) ?? true },
                        set: { _ in model.toggleTopic(topic.id) })
                ) {
                    HStack(spacing: GPSpace.s12) {
                        Text(verbatim: topic.title.localized).gpText(GPType.body).fixedSize(
                            horizontal: false, vertical: true)
                        Spacer(minLength: GPSpace.s8)
                        Text(topicCount(topic), format: .number).gpText(GPType.subhead).monospacedDigit()
                            .foregroundStyle(Color(.textSecondary))
                    }
                }.tint(StudySection(model.form.section).color).frame(minHeight: GPSize.rowTall)
                    .padding(.vertical, GPSpace.s8).accessibilityIdentifier("builder.topic.\(topic.id)")
            }
        }.padding(.horizontal, GPSpace.s16).background(
            Color(.surface), in: RoundedRectangle(cornerRadius: GPRadius.xxl))
    }
    private var difficulty: some View {
        VStack(alignment: .leading, spacing: GPSpace.s12) {
            Text("Сложность").gpText(GPType.body)
            Picker("Сложность", selection: Binding(get: { model.form.difficulty }, set: model.setDifficulty)) {
                Text("Любая").tag(Optional<Components.Schemas.Difficulty>.none)
                ForEach(Components.Schemas.Difficulty.allCases, id: \.self) { Text($0.label).tag(Optional($0)) }
            }.pickerStyle(.segmented).labelsHidden().accessibilityIdentifier("builder.difficulty")
        }
    }
    private func topicCount(_ topic: Components.Schemas.TrainingTopic) -> Int {
        switch model.form.difficulty {
        case nil: topic.available.easy + topic.available.medium + topic.available.hard
        case .easy: topic.available.easy
        case .medium: topic.available.medium
        case .hard: topic.available.hard
        }
    }
    private var done: some View {
        Button(action: onDone) { Text("Готово · \(TrainingCopy.tasks(model.available))") }
            .buttonStyle(PrimaryCapsuleStyle()).opacity(model.available == 0 ? 0.5 : 1)
            .disabled(model.available == 0).accessibilityIdentifier("builder.topics.done")
    }
}

struct TrainingSessionPlaceholder: View {
    let trainings: TrainingModel
    let id: String
    var body: some View {
        VStack {
            if let t = trainings.trainings[id] {
                ContentUnavailableView {
                    Text("\(t.position + 1) из \(t.total)").gpText(GPType.title2)
                } description: {
                    Text("Тренировка сохранена на устройстве. Экран вопроса появится в следующей части.")
                }
                .navigationTitle(Text(StudySection(t.session.section).label))
                .background { SectionGlow(section: StudySection(t.session.section)) }
            } else {
                ContentUnavailableView(
                    "Тренировки нет на устройстве", systemImage: "tray",
                    description:
                        Text("Она могла устареть. Начните новую с экрана «Сегодня»."))
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("training.session")
    }
}

enum TrainingCopy {
    static func questions(_ count: Int) -> String { String(localized: "\(count) вопросов") }
    static func tasks(_ count: Int) -> String { String(localized: "\(count) заданий") }
    static func continuation(_ training: StoredTraining) -> String {
        let section = String(localized: StudySection(training.session.section).label)
        return String(localized: "\(section) · вопрос \(training.position + 1) из \(training.total)")
    }
}
