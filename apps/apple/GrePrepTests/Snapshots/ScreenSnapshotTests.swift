import GPAPI
import SnapshotTesting
import SwiftUI
import Testing

@testable import GrePrep

#if os(iOS)
    import Vision
#endif

/// Эталонные снимки экранов: iPhone, iPad и Mac — в светлой и тёмной теме. Каждое устройство снимается на своём
/// симуляторе (гейт гоняет набор на iPhone и на iPad): стекло iOS 26 рисуется только в настоящем окне, а окно
/// iPhone не вмещает раскладку iPad. Эталоны — в __Snapshots__ рядом; переснимать только при намеренной правке вида и писать об
/// этом в коммите (AGENTS.md, «Тесты»). Шрифт Onest регистрирует само приложение-хост при запуске.
@MainActor
@Suite("Снимки экранов", .serialized)
struct ScreenSnapshotTests {
    let server = StubServer()

    /// Приложение, где человек уже вошёл, а сервер отвечает заданным.
    func signedInApp(cached: TodayDTO?, today reply: StubServer.Reply) throws -> AppModel {
        server.on("GET /api/today", reply)
        let cache = temporaryCache()
        if let cached { try cache.save(cached) }
        return AppModel(
            config: server.config(), tokens: MemoryTokenStore("t"), cache: cache, network: NetworkMonitor(),
            session: server.session)
    }

    static let completeDTO: TodayDTO = try! JSONDecoder().decode(
        TodayDTO.self,
        from: Data(
            #"""
            {"date":"2026-10-06","steps":[
              {"id":"verbal","section":"verbal","title":"Тренировка","minutes":12,"state":"done"},
              {"id":"quant","section":"quant","title":"Повторение: проценты и доли","minutes":9,"state":"done"},
              {"id":"words","section":"words","title":"Слова","minutes":4,"state":"done"}
            ]}
            """#.utf8))

    @Test("вход")
    func signIn() {
        let app = AppModel(
            config: server.config(), tokens: MemoryTokenStore(), cache: temporaryCache(), network: NetworkMonitor(),
            session: server.session)
        let view = SignInView(app: app, reason: nil, showsDevelopmentSignIn: false).environment(app)
        assertScreens(view, named: "signin")
    }

    @Test("вход закончился", .enabled { await ScreenSnapshotTests.isPhone() })
    func signInExpired() {
        let app = AppModel(
            config: server.config(), tokens: MemoryTokenStore(), cache: temporaryCache(), network: NetworkMonitor(),
            session: server.session)
        let view = SignInView(app: app, reason: .sessionExpired, showsDevelopmentSignIn: false).environment(app)
        assertScreens(view, named: "signin-expired", devices: [.phone])
    }

    @Test("«Сегодня» — план")
    func today() async throws {
        let app = try signedInApp(cached: nil, today: .json(200, Fixture.todayJSON))
        let model = try #require(app.today)
        await model.refresh()
        assertScreens(
            MainView(today: model, refreshesOnAppear: false).environment(app), named: "today",
            // Панель вкладок — системное стекло, каждый кадр чуть другой; ленту строго проверяют снимки TodayView.
            precision: 0.995)
    }

    @Test("«Сегодня» — всё сделано", .enabled { await ScreenSnapshotTests.isPhone() })
    func todayComplete() async throws {
        let json = String(data: try JSONEncoder().encode(Self.completeDTO), encoding: .utf8)!
        let app = try signedInApp(cached: nil, today: .json(200, json))
        let model = try #require(app.today)
        await model.refresh()
        assertScreens(
            TodayView(model: model, refreshesOnAppear: false).environment(app), named: "today-complete",
            devices: [.phone])
    }

    @Test("«Сегодня» — нет сети, прошлый план", .enabled { await ScreenSnapshotTests.isPhone() })
    func todayOfflineStale() async throws {
        let app = try signedInApp(cached: Fixture.todayDTO, today: .failure(.notConnectedToInternet))
        let model = try #require(app.today)
        await model.refresh()
        #expect(model.staleReason == .offline)
        assertScreens(
            TodayView(model: model, refreshesOnAppear: false).environment(app), named: "today-offline-stale",
            devices: [.phone])
    }

    @Test("«Сегодня» — нет сети и плана нет", .enabled { await ScreenSnapshotTests.isPhone() })
    func todayOfflineEmpty() async throws {
        let app = try signedInApp(cached: nil, today: .failure(.notConnectedToInternet))
        let model = try #require(app.today)
        await model.refresh()
        assertScreens(
            TodayView(model: model, refreshesOnAppear: false).environment(app), named: "today-offline-empty",
            devices: [.phone])
    }

    @Test("«Сегодня» — загрузка", .enabled { await ScreenSnapshotTests.isPhone() })
    func todayLoading() throws {
        let app = try signedInApp(cached: nil, today: .json(200, Fixture.todayJSON))
        let model = try #require(app.today)
        assertScreens(
            TodayView(model: model, refreshesOnAppear: false).environment(app), named: "today-loading",
            devices: [.phone],
            // Крутилка крутится: кадр каждый раз чуть другой — допуск шире, проверяется раскладка.
            precision: 0.995)
    }

    #if os(iOS)
        @Test("«Сегодня» — крупный текст: ничего не обрезано", .enabled { await ScreenSnapshotTests.isPhone() })
        func todayLargeText() async throws {
            let app = try signedInApp(cached: nil, today: .json(200, Fixture.todayJSON))
            let model = try #require(app.today)
            await model.refresh()
            let view = TodayView(model: model, refreshesOnAppear: false).environment(app).environment(
                \.glassEnabled, false)
            // Тема явная: снимок не зависит от того, какой оставил просмотрщик на симуляторе.
            let traits = UITraitCollection { traits in
                traits.userInterfaceStyle = .light
                traits.preferredContentSizeCategory = .accessibilityLarge
            }
            assertSnapshot(
                of: view,
                as: .image(
                    drawHierarchyInKeyWindow: true, precision: Self.precision, perceptualPrecision: Self.perceptual,
                    layout: .device(config: Self.phone), traits: traits
                ),
                named: "today-large-text"
            )
        }
    #endif

    @Test("«Сегодня» — не получилось обновить, прошлый план", .enabled { await ScreenSnapshotTests.isPhone() })
    func todayFailedStale() async throws {
        let app = try signedInApp(cached: Fixture.todayDTO, today: .json(500, Fixture.error("internal")))
        let model = try #require(app.today)
        await model.refresh()
        assertScreens(
            TodayView(model: model, refreshesOnAppear: false).environment(app), named: "today-failed-stale",
            devices: [.phone], themes: [.light])
    }

    @Test("«Сегодня» — не получилось загрузить", .enabled { await ScreenSnapshotTests.isPhone() })
    func todayFailedEmpty() async throws {
        let app = try signedInApp(cached: nil, today: .json(500, Fixture.error("internal")))
        let model = try #require(app.today)
        await model.refresh()
        assertScreens(
            TodayView(model: model, refreshesOnAppear: false).environment(app), named: "today-failed-empty",
            devices: [.phone], themes: [.light])
    }

    @Test("«Сегодня» — без сети шаг не начать: объяснение у шага", .enabled { await ScreenSnapshotTests.isPhone() })
    func todayNeedsNetwork() async throws {
        let app = try signedInApp(cached: Fixture.todayDTO, today: .failure(.notConnectedToInternet))
        let model = try #require(app.today)
        await model.refresh()
        assertScreens(
            TodayView(model: model, refreshesOnAppear: false, blockedStepID: "words").environment(app),
            named: "today-needs-network", devices: [.phone])
    }

    #if os(iOS)
        @Test(
            "«Сегодня» — восемь шагов (предел договора) крупным текстом",
            .enabled { await ScreenSnapshotTests.isPhone() })
        func todayEightStepsLargeText() async throws {
            let sections = ["verbal", "quant", "words", "essay", "verbal", "quant", "words", "essay"]
            let steps = sections.enumerated().map { i, section in
                #"{"id":"s\#(i)","section":"\#(section)","title":"Шаг \#(i + 1): длинное название шага","minutes":\#(5 + i),"state":"\#(i == 0 ? "current" : "next")"}"#
            }
            let json = #"{"date":"2026-10-06","steps":["# + steps.joined(separator: ",") + "]}"
            let app = try signedInApp(cached: nil, today: .json(200, json))
            let model = try #require(app.today)
            await model.refresh()
            let view = TodayView(model: model, refreshesOnAppear: false).environment(app)
                .environment(\.glassEnabled, false)
            assertSnapshot(
                of: view,
                as: .image(
                    drawHierarchyInKeyWindow: true, precision: Self.precision, perceptualPrecision: Self.perceptual,
                    layout: .device(config: Self.phone),
                    traits: UITraitCollection { traits in
                        traits.userInterfaceStyle = .light
                        traits.preferredContentSizeCategory = .accessibilityLarge
                    }
                ),
                named: "today-eight-steps-large-text"
            )
        }
    #endif

    @Test("вход — сообщение под кнопками", .enabled { await ScreenSnapshotTests.isPhone() })
    func signInMessage() async {
        let app = AppModel(
            config: server.config(), tokens: MemoryTokenStore(), cache: temporaryCache(), network: NetworkMonitor(),
            session: server.session)
        let model = SignInModel(app: app)
        await model.signInWithWeb(.telegram) { url, _ in url }
        assertScreens(
            SignInView(model: model, reason: nil, showsDevelopmentSignIn: false).environment(app),
            named: "signin-message", devices: [.phone], themes: [.light])
    }

    @Test("«Прогресс» — пока тренировок нет", .enabled { await ScreenSnapshotTests.isPhone() })
    func progress() {
        let app = AppModel(
            config: server.config(), tokens: MemoryTokenStore("t"), cache: temporaryCache(), network: NetworkMonitor(),
            session: server.session)
        assertScreens(ProgressTabView().environment(app), named: "progress", devices: [.phone])
    }

    @Test("настройки", .enabled { await ScreenSnapshotTests.isPhone() })
    func settings() {
        let app = AppModel(
            config: server.config(), tokens: MemoryTokenStore("t"), cache: temporaryCache(), network: NetworkMonitor(),
            session: server.session)
        assertScreens(NavigationStack { SettingsView() }.environment(app), named: "settings", devices: [.phone])
    }

    @Test("раздел, которого ещё нет", .enabled { await ScreenSnapshotTests.isPhone() })
    func sectionPlaceholder() {
        assertScreens(
            SectionPlaceholderView(
                title: "Слова", message: "Здесь будет словарь: слова на сегодня, повторение и поиск."),
            named: "placeholder", devices: [.phone], themes: [.light])
    }

    // MARK: - Устройства

    @Test("конструктор тренировки")
    func trainingBuilder() throws {
        let app = try signedInApp(cached: nil, today: .json(200, Fixture.todayJSON))
        let model = BuilderModel(trainings: app.trainings, loadsOnInit: false)
        model.use(TrainingFixture.options)
        assertScreens(
            NavigationStack { TrainingBuilderView(model: model) }.environment(app),
            named: "training-builder")
    }

    @Test("темы и сложность")
    func trainingTopics() throws {
        let app = try signedInApp(cached: nil, today: .json(200, Fixture.todayJSON))
        let model = BuilderModel(trainings: app.trainings, loadsOnInit: false)
        model.use(TrainingFixture.options)
        model.toggleTopic("contrast")
        assertScreens(NavigationStack { TrainingTopicsView(model: model) }.environment(app), named: "training-topics")
    }

    @Test("«Сегодня» — продолжить тренировку")
    func todayWithTraining() async throws {
        let app = try signedInApp(cached: nil, today: .json(200, Fixture.todayJSON))
        try app.didSignIn(.init(token: "t", user: Fixture.user))
        server.on("POST /api/trainings", .json(201, TrainingFixture.json(TrainingFixture.session)))
        let id = try await app.trainings.start(TrainingFixture.options.presets[0].request)
        app.trainings.recordPosition(id, position: 2)
        await eventually { app.trainings.active?.position == 2 }
        let model = try #require(app.today)
        await model.refresh()
        assertScreens(TodayView(model: model, refreshesOnAppear: false).environment(app), named: "today-with-training")
    }

    @Test("конструктор — нет сети и сбой")
    func trainingUnavailable() async throws {
        let app = try signedInApp(cached: nil, today: .json(200, Fixture.todayJSON))
        let model = BuilderModel(trainings: app.trainings, loadsOnInit: false)
        server.on("GET /api/trainings/options", .failure(.notConnectedToInternet))
        await model.load()
        assertScreens(
            NavigationStack { TrainingBuilderView(model: model) }.environment(app),
            named: "training-offline")
        server.on("GET /api/trainings/options", .json(500, Fixture.error("internal")))
        await model.load()
        assertScreens(
            NavigationStack { TrainingBuilderView(model: model) }.environment(app),
            named: "training-failed")
    }

    @Test("конструктор — ошибка старта")
    func trainingStartProblems() async throws {
        let app = try signedInApp(cached: nil, today: .json(200, Fixture.todayJSON))
        try app.didSignIn(.init(token: "t", user: Fixture.user))
        let model = BuilderModel(trainings: app.trainings, loadsOnInit: false)
        model.use(TrainingFixture.options)
        for (reply, name) in [
            (StubServer.Reply.json(409, Fixture.error("no_questions")), "training-no-questions"),
            (.failure(.notConnectedToInternet), "training-start-offline"),
            (.json(500, Fixture.error("internal")), "training-start-failed"),
        ] {
            server.on("POST /api/trainings", reply)
            _ = await model.start()
            assertScreens(
                NavigationStack { TrainingBuilderView(model: model) }.environment(app),
                named: name)
        }
        model.setType(.sentenceEquivalence)
        assertScreens(
            NavigationStack { TrainingBuilderView(model: model) }.environment(app),
            named: "training-empty")
    }

    @Test("вопрос начатой тренировки и отсутствие данных")
    func trainingSession() async throws {
        let app = try signedInApp(cached: nil, today: .json(200, Fixture.todayJSON))
        try app.didSignIn(.init(token: "t", user: Fixture.user))
        server.on("POST /api/trainings", .json(201, TrainingFixture.json(TrainingFixture.session)))
        let id = try await app.trainings.start(TrainingFixture.options.presets[0].request)
        assertScreens(
            NavigationStack { TrainingSessionView(id: id, trainings: app.trainings) }.environment(app),
            named: "training-session")
        assertScreens(
            NavigationStack { TrainingSessionView(id: "missing", trainings: app.trainings) }.environment(app),
            named: "training-missing")
    }

    private func sessionModel(_ question: Question, check: Bool = false, clock: TrainingTestClock = TrainingTestClock())
        async throws -> SessionModel
    {
        var t = TrainingFixture.stored()
        t.session.items = (0..<3).map { .init(position: $0, question: question) }
        t.session.questionTypes = [question.questionType]
        t.session.section = question.section
        if check {
            t.session.mode = .check
            t.session.timeLimitSeconds = 270
        }
        let store = temporaryTrainingStore()
        try store.saveOwner("person")
        try store.save(t)
        server.on("POST /api/trainings/\(t.id)/answers", .failure(.notConnectedToInternet))
        let trainings = TrainingModel(
            store: store, now: { clock.now }, report: { _, _ in }, unauthorized: {})
        trainings.connect(
            api: API(config: server.config(), session: server.session, tokens: MemoryTokenStore("t")), ownerID: "person"
        )
        await eventually { trainings.trainings[t.id] != nil }
        return SessionModel(id: t.id, trainings: trainings)
    }

    private func assertSession(
        _ model: SessionModel, name: String, file: StaticString = #filePath, testName: String = #function,
        line: UInt = #line
    ) {
        let view = NavigationStack { TrainingSessionView(model: model) }
        assertScreens(view, named: name, file: file, testName: testName, line: line)
        assertScreens(
            view.environment(\.textScale, GPType.textScaleLarge), named: name + "-larger", file: file,
            testName: testName, line: line)
    }

    @Test("вопрос: четыре типа и один, два, три пропуска")
    func trainingQuestions() async throws {
        for (type, blanks, name) in [
            (Components.Schemas.QuestionType.textCompletion, 1, "tc"), (.textCompletion, 2, "tc-two"),
            (.textCompletion, 3, "tc-three"), (.sentenceEquivalence, 1, "se"),
            (.quantitativeComparison, 1, "qc"), (.multipleChoice, 1, "mc"),
        ] {
            let q = TrainingFixture.sample(type, blanks: blanks)
            let model = try await sessionModel(q)
            model.select(q.groups[0].options[0].id)
            assertSession(model, name: "training-question-" + name)
        }
    }

    @Test("разбор: неверно, раскрыт, EN, верно, «Не знаю»")
    func trainingExplanation() async throws {
        let q = TrainingFixture.sample(.textCompletion)
        let model = try await sessionModel(q)
        model.select("C")
        model.check()
        assertSession(model, name: "training-explanation")
        model.whyNotOpen = true
        assertSession(model, name: "training-explanation-open")
        model.english = true
        assertSession(model, name: "training-explanation-en")
        let correct = try await sessionModel(TrainingFixture.sample(.sentenceEquivalence))
        for option in correct.screen!.question.answer { correct.select(option) }
        correct.check()
        assertSession(correct, name: "training-correct")
        let unknown = try await sessionModel(q)
        unknown.dontKnow()
        assertSession(unknown, name: "training-dont-know")
    }

    @Test("Проверка: таймер и список вопросов")
    func trainingCheck() async throws {
        let model = try await sessionModel(TrainingFixture.sample(.textCompletion), check: true)
        model.toggleFlag()
        model.next()
        model.select("A")
        assertSession(model, name: "training-check")
        model.openOverview()
        assertSession(model, name: "training-overview")
        #if os(iOS)
            if UIDevice.current.userInterfaceIdiom == .pad {
                let q = TrainingFixture.sample(.textCompletion, blanks: 3)
                let partial = try await sessionModel(q, check: true)
                partial.select(q.answer[0])
                partial.openOverview()
                for larger in [false, true] {
                    let view = NavigationStack { TrainingSessionView(model: partial) }
                        .environment(\.glassEnabled, false)
                        .environment(\.textScale, larger ? GPType.textScaleLarge : 1)
                    for dark in [false, true] {
                        assertSnapshot(
                            of: view,
                            as: .image(
                                drawHierarchyInKeyWindow: true,
                                precision: Self.precision, perceptualPrecision: Self.perceptual,
                                layout: .device(config: Self.padLandscape),
                                traits: UITraitCollection(userInterfaceStyle: dark ? .dark : .light)
                            ),
                            named:
                                "training-overview-partial\(larger ? "-larger" : "")-ipad-landscape-\(dark ? "dark" : "light")"
                        )
                    }
                }
            }
        #endif
    }

    @Test("итог: ошибки и без ошибок")
    func trainingSummary() async throws {
        let q = TrainingFixture.sample(.textCompletion)
        let model = try await sessionModel(q)
        model.select("A")
        model.check()
        model.next()
        model.select("C")
        model.check()
        model.next()
        model.dontKnow()
        model.next()
        assertSession(model, name: "training-summary")
        let perfect = try await sessionModel(q)
        for _ in 0..<3 {
            perfect.select("A")
            perfect.check()
            perfect.next()
        }
        assertSession(perfect, name: "training-summary-perfect")
        let clock = TrainingTestClock()
        let timed = try await sessionModel(q, check: true, clock: clock)
        timed.select("C")
        clock.advance(300)
        timed.tick()
        assertSession(timed, name: "training-summary-timed-out")
    }

    #if os(iOS)
        @Test(
            "разбор целиком виден на iPad с «Крупнее»",
            .enabled { await MainActor.run { UIDevice.current.userInterfaceIdiom == .pad } })
        func trainingExplanationDoesNotTruncate() async throws {
            let model = try await sessionModel(TrainingFixture.sample(.textCompletion))
            model.select("C")
            model.check()
            model.english = false
            model.whyNotOpen = true
            let view = AnyView(
                NavigationStack { TrainingSessionView(model: model) }
                    .environment(\.textScale, GPType.textScaleLarge).environment(\.glassEnabled, false))
            let strategy = Snapshotting<AnyView, UIImage>.image(
                drawHierarchyInKeyWindow: true, layout: .device(config: Self.pad),
                traits: UITraitCollection(userInterfaceStyle: .light))
            let rendered: UIImage = await withCheckedContinuation { continuation in
                strategy.snapshot(view).run { continuation.resume(returning: $0) }
            }
            let cgImage = try #require(rendered.cgImage)
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["ru-RU", "en-US"]
            try VNImageRequestHandler(cgImage: cgImage).perform([request])
            let visible = request.results?.compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ") ?? ""
            // Метка VoiceOver содержит весь текст даже при обрезании; проверяем именно прочитанные пиксели.
            #expect(visible.contains("повтора"), "Конец объяснения не виден: \(visible)")
        }

        @Test("вопрос и разбор с крупным системным шрифтом", .enabled { await ScreenSnapshotTests.isPhone() })
        func trainingDynamicType() async throws {
            let model = try await sessionModel(TrainingFixture.sample(.textCompletion, blanks: 3))
            assertScreens(
                NavigationStack { TrainingSessionView(model: model) }.environment(\.dynamicTypeSize, .accessibility3),
                named: "training-dynamic-type", devices: [.phone])
            model.dontKnow()
            assertScreens(
                NavigationStack { TrainingSessionView(model: model) }.environment(\.dynamicTypeSize, .accessibility3),
                named: "training-dynamic-explanation",
                devices: [.phone])
        }
    #endif

    enum Device { case phone, pad }
    enum Theme { case light, dark }

    /// Тесты только для телефона на iPad и Mac пропускаются явно (в отчёте — «пропущен», а не пустой «прошёл»).
    nonisolated static func isPhone() async -> Bool {
        #if os(iOS)
            await MainActor.run { UIDevice.current.userInterfaceIdiom == .phone }
        #else
            false
        #endif
    }

    /// Стекло в снимках выключено, кадр детерминирован: допуск — доли пикселей сглаживания, а не пропавший значок
    /// или цифра (0,5 % пропускали и то и другое).
    static let precision: Float = 0.9999
    static let perceptual: Float = 0.98

    #if os(iOS)
        /// iPhone 18 Pro: 402 × 874 pt, вырез сверху 62, полоса жестов 34.
        static let phone = ViewImageConfig(
            safeArea: UIEdgeInsets(top: 62, left: 0, bottom: 34, right: 0),
            size: CGSize(width: 402, height: 874),
            traits: UITraitCollection { traits in
                traits.userInterfaceIdiom = .phone
                traits.displayScale = 3
                traits.horizontalSizeClass = .compact
                traits.verticalSizeClass = .regular
            }
        )

        /// iPad Pro 11″ (M5) в книжной ориентации — размер экрана симулятора «GrePrep iPad».
        static let pad = ViewImageConfig(
            safeArea: UIEdgeInsets(top: 24, left: 0, bottom: 20, right: 0),
            size: CGSize(width: 834, height: 1210),
            traits: UITraitCollection { traits in
                traits.userInterfaceIdiom = .pad
                traits.displayScale = 2
                traits.horizontalSizeClass = .regular
                traits.verticalSizeClass = .regular
            }
        )

        static let padLandscape = ViewImageConfig(
            safeArea: UIEdgeInsets(top: 24, left: 0, bottom: 20, right: 0),
            size: CGSize(width: 1210, height: 834),
            traits: UITraitCollection { traits in
                traits.userInterfaceIdiom = .pad
                traits.displayScale = 2
                traits.horizontalSizeClass = .regular
                traits.verticalSizeClass = .regular
            }
        )
    #endif

    func assertScreens(
        _ screen: some View,
        named name: String,
        devices: [Device] = [.phone, .pad],
        themes: [Theme] = [.light, .dark],
        precision: Float = ScreenSnapshotTests.precision,
        fileID: StaticString = #fileID,
        file: StaticString = #filePath,
        testName: String = #function,
        line: UInt = #line,
        column: UInt = #column
    ) {
        let view = screen.environment(\.glassEnabled, false)
        #if os(iOS)
            let current: Device = UIDevice.current.userInterfaceIdiom == .pad ? .pad : .phone
            for device in devices where device == current {
                let config = device == .phone ? Self.phone : Self.pad
                for style in themes.map({ $0 == .dark ? UIUserInterfaceStyle.dark : .light }) {
                    assertSnapshot(
                        of: view,
                        as: .image(
                            // Через окно симулятора: стекло iOS 26 и материалы вне окна не рисуются.
                            drawHierarchyInKeyWindow: true,
                            precision: precision, perceptualPrecision: Self.perceptual,
                            layout: .device(config: config),
                            traits: UITraitCollection(userInterfaceStyle: style)
                        ),
                        named: "\(name)-\(device == .phone ? "iphone" : "ipad")-\(style == .dark ? "dark" : "light")",
                        fileID: fileID, file: file, testName: testName, line: line, column: column
                    )
                }
            }
        #elseif os(macOS)
            // Mac снимается без окна (боковую панель и заголовок рисует окно), поэтому — только экраны, где
            // важна широкая раскладка, те же, что на iPad.
            guard devices.contains(.pad) else { return }
            for dark in themes.map({ $0 == .dark }) {
                let controller = NSHostingController(rootView: view)
                controller.view.frame = CGRect(x: 0, y: 0, width: 1100, height: 760)
                controller.view.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
                assertSnapshot(
                    of: controller,
                    as: .image(
                        precision: Self.precision, perceptualPrecision: Self.perceptual,
                        size: CGSize(width: 1100, height: 760)),
                    named: "\(name)-mac-\(dark ? "dark" : "light")",
                    fileID: fileID, file: file, testName: testName, line: line, column: column
                )
            }
        #endif
    }
}
