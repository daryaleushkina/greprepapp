import XCTest

/// Сценарии через интерфейс, как это делает человек, против настоящего локального сервера (вход подменой,
/// DEV_AUTH=1). Адрес сервера — GP_UI_SERVER (гейт поднимает свой на отдельном порту), без него —
/// сервер разработки 127.0.0.1:8090. У каждого сценария свой пользователь.
@MainActor
final class AppFlowTests: XCTestCase {
    private var serverURL: String {
        ProcessInfo.processInfo.environment["GP_UI_SERVER"] ?? "http://127.0.0.1:8090"
    }

    /// Адрес, где точно никто не слушает: так выглядит «нет сети» для приложения.
    private let unreachableServer = "http://127.0.0.1:9"

    override func setUp() async throws {
        continueAfterFailure = false
    }

    private func launch(reset: Bool, server: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"] + (reset ? ["-GPResetState"] : [])
        app.launchEnvironment["GP_API_BASE_URL"] = server ?? serverURL
        app.launch()
        return app
    }

    private func signIn(_ app: XCUIApplication) {
        let name = app.textFields["signin.dev.name"]
        XCTAssertTrue(name.waitForExistence(timeout: 10), "нет поля входа подменой")
        name.tap()
        name.typeText("ui-\(UUID().uuidString.prefix(12).lowercased())")
        app.buttons["signin.dev.submit"].tap()
        XCTAssertTrue(app.staticTexts["today.summary"].waitForExistence(timeout: 15), "после входа нет «Сегодня»")
    }

    func testSignInShowsTodayAndOpensStep() {
        let app = launch(reset: true)
        XCTAssertTrue(app.buttons["signin.telegram"].waitForExistence(timeout: 10))
        signIn(app)
        XCTAssertEqual(app.staticTexts["today.summary"].label, "Три шага · около 25 минут")
        // Названия шагов — от сервера (server/internal/today): дело без раздела, раздел — строкой ниже.
        XCTAssertTrue(app.staticTexts["Повторение"].exists)
        XCTAssertTrue(app.staticTexts["Text Completion"].exists)

        app.buttons["today.start"].tap()
        // Открылся шаг: заголовок экрана — раздел шага, ленты под ним нет.
        XCTAssertTrue(app.navigationBars["Слова"].waitForExistence(timeout: 5), "шаг не открылся")
        XCTAssertFalse(app.staticTexts["today.summary"].exists)
        app.navigationBars["Слова"].buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.staticTexts["today.summary"].waitForExistence(timeout: 5))
    }

    func testSessionSurvivesRelaunch() {
        let app = launch(reset: true)
        signIn(app)
        app.terminate()

        let again = launch(reset: false)
        XCTAssertTrue(again.staticTexts["today.summary"].waitForExistence(timeout: 15))
        XCTAssertFalse(again.buttons["signin.telegram"].exists)
    }

    func testSignOutReturnsToSignInForGood() {
        let app = launch(reset: true)
        signIn(app)
        app.tabBars.buttons["Прогресс"].firstMatch.tap()
        app.buttons["progress.settings"].firstMatch.tap()
        app.buttons["settings.signOut"].tap()
        XCTAssertTrue(app.buttons["signin.telegram"].waitForExistence(timeout: 5))
        app.terminate()

        let again = launch(reset: false)
        XCTAssertTrue(
            again.buttons["signin.telegram"].waitForExistence(timeout: 10),
            "после выхода и перезапуска вход не должен вернуться")
    }

    func testOfflineKeepsLastPlanAndExplainsStart() {
        let app = launch(reset: true)
        signIn(app)
        app.terminate()

        let offline = launch(reset: false, server: unreachableServer)
        XCTAssertTrue(
            offline.staticTexts["today.summary"].waitForExistence(timeout: 10), "без сети должен остаться прошлый план")
        XCTAssertTrue(offline.staticTexts["today.stale"].waitForExistence(timeout: 15), "нет строки «Нет сети»")
        offline.buttons["today.start"].tap()
        XCTAssertTrue(
            offline.staticTexts["today.needsNetwork"].waitForExistence(timeout: 5), "нет объяснения, что нужна сеть")
        XCTAssertFalse(offline.navigationBars["Слова"].exists, "без сети шаг не должен открываться")
    }

    func testProvidersWithoutAccountsSayItHonestly() {
        let app = launch(reset: true)
        let telegram = app.buttons["signin.telegram"]
        XCTAssertTrue(telegram.waitForExistence(timeout: 10))
        telegram.tap()
        let message = app.staticTexts["signin.message"]
        XCTAssertTrue(message.waitForExistence(timeout: 5))
        XCTAssertTrue(message.label.contains("ещё не подключён"), message.label)
    }
}
