import SnapshotTesting
import SwiftUI
import Testing

@testable import GrePrep

/// Эталонные снимки экранов: iPhone, iPad и Mac — в светлой и тёмной теме. Каждое устройство снимается на своём
/// симуляторе (гейт гоняет набор на iPhone и на iPad): стекло iOS 26 рисуется только в настоящем окне, а окно
/// iPhone не вмещает раскладку iPad. Эталоны — в __Snapshots__ рядом; переснимать только при намеренной правке вида и писать об
/// этом в коммите (CLAUDE.md, «Тесты»). Шрифт Onest регистрирует само приложение-хост при запуске.
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

    @Test("вход закончился")
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
        assertScreens(MainView(today: model, refreshesOnAppear: false).environment(app), named: "today")
    }

    @Test("«Сегодня» — всё сделано")
    func todayComplete() async throws {
        let json = String(data: try JSONEncoder().encode(Self.completeDTO), encoding: .utf8)!
        let app = try signedInApp(cached: nil, today: .json(200, json))
        let model = try #require(app.today)
        await model.refresh()
        assertScreens(
            TodayView(model: model, refreshesOnAppear: false).environment(app), named: "today-complete",
            devices: [.phone])
    }

    @Test("«Сегодня» — нет сети, прошлый план")
    func todayOfflineStale() async throws {
        let app = try signedInApp(cached: Fixture.todayDTO, today: .failure(.notConnectedToInternet))
        let model = try #require(app.today)
        await model.refresh()
        #expect(model.staleReason == .offline)
        assertScreens(
            TodayView(model: model, refreshesOnAppear: false).environment(app), named: "today-offline-stale",
            devices: [.phone])
    }

    @Test("«Сегодня» — нет сети и плана нет")
    func todayOfflineEmpty() async throws {
        let app = try signedInApp(cached: nil, today: .failure(.notConnectedToInternet))
        let model = try #require(app.today)
        await model.refresh()
        assertScreens(
            TodayView(model: model, refreshesOnAppear: false).environment(app), named: "today-offline-empty",
            devices: [.phone])
    }

    @Test("«Сегодня» — загрузка")
    func todayLoading() throws {
        let app = try signedInApp(cached: nil, today: .json(200, Fixture.todayJSON))
        let model = try #require(app.today)
        assertScreens(
            TodayView(model: model, refreshesOnAppear: false).environment(app), named: "today-loading",
            devices: [.phone])
    }

    #if os(iOS)
        @Test("«Сегодня» — крупный текст: ничего не обрезано")
        func todayLargeText() async throws {
            guard UIDevice.current.userInterfaceIdiom == .phone else { return }
            let app = try signedInApp(cached: nil, today: .json(200, Fixture.todayJSON))
            let model = try #require(app.today)
            await model.refresh()
            let view = TodayView(model: model, refreshesOnAppear: false).environment(app).environment(
                \.glassEnabled, false)
            let traits = UITraitCollection(preferredContentSizeCategory: .accessibilityLarge)
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

    // MARK: - Устройства

    enum Device { case phone, pad }

    static let precision: Float = 0.995
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
    #endif

    func assertScreens(
        _ screen: some View,
        named name: String,
        devices: [Device] = [.phone, .pad],
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
                for style in [UIUserInterfaceStyle.light, .dark] {
                    assertSnapshot(
                        of: view,
                        as: .image(
                            // Через окно симулятора: стекло iOS 26 и материалы вне окна не рисуются.
                            drawHierarchyInKeyWindow: true,
                            precision: Self.precision, perceptualPrecision: Self.perceptual,
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
            for dark in [false, true] {
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
