import UIKit
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
    private var userPrefix = "ui"

    private let unreachableServer = "http://127.0.0.1:9"

    override func setUp() async throws {
        continueAfterFailure = false
    }

    private func launch(reset: Bool, server: String? = nil, largeText: Bool = false, language: String = "ru")
        -> XCUIApplication
    {
        let app = XCUIApplication()
        app.launchArguments =
            ["-AppleLanguages", "(\(language))", "-AppleLocale", language == "ru" ? "ru_RU" : "en_US"]
            + (reset ? ["-GPResetState"] : [])
        if largeText {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        }
        app.launchEnvironment["GP_API_BASE_URL"] = server ?? serverURL
        app.launch()
        return app
    }

    @discardableResult
    private func signIn(_ app: XCUIApplication) -> String {
        let name = app.textFields["signin.dev.name"]
        XCTAssertTrue(name.waitForExistence(timeout: 10), "нет поля входа подменой")
        name.tap()
        let userName = "\(userPrefix)-\(UUID().uuidString.prefix(12).lowercased())"
        name.typeText(userName)
        app.buttons["signin.dev.submit"].tap()
        XCTAssertTrue(app.staticTexts["today.summary"].waitForExistence(timeout: 15), "после входа нет «Сегодня»")
        return userName
    }

    func testEnglishNewAccountUsesInterfaceLanguage() async throws {
        let app = launch(reset: true, language: "en")
        let name = signIn(app)
        // Повторный вход в тот же тестовый аккаунт язык не меняет: ответ проверяет, с чем его создало приложение.
        var request = URLRequest(url: try XCTUnwrap(URL(string: serverURL + "/api/auth/dev")))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "name": name, "transport": "bearer", "clientKind": "ios",
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
        struct Session: Decodable {
            struct User: Decodable { let locale: String }
            let user: User
        }
        XCTAssertEqual(try JSONDecoder().decode(Session.self, from: data).user.locale, "en")
        app.tabBars.buttons["Progress"].firstMatch.tap()
        app.buttons["progress.settings"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["settings.etsDisclaimer"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["settings.etsDisclaimer"].label.hasPrefix("GRE® is a registered trademark"))
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
        let disclaimer = app.staticTexts["settings.etsDisclaimer"]
        XCTAssertTrue(disclaimer.waitForExistence(timeout: 5))
        XCTAssertEqual(
            disclaimer.label,
            "GRE® is a registered trademark of Educational Testing Service (ETS). This product is not endorsed or approved by ETS."
        )
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

    func testTrainingBuilderStartAndContinueAfterRelaunch() {
        let app = launch(reset: true)
        signIn(app)
        app.swipeUp()
        app.buttons["today.newTraining"].tap()
        XCTAssertTrue(app.buttons["builder.start"].waitForExistence(timeout: 10))
        // Full-screen cover сохраняет TabView в иерархии; под экраном тренировки вкладки недоступны.
        let hiddenTabs = expectation(
            for: NSPredicate(format: "hittable == false"), evaluatedWith: app.tabBars.firstMatch)
        wait(for: [hiddenTabs], timeout: 5)
        let count = app.textFields["builder.count"]
        // Касание справа от числа ставит курсор в конец поля, как при обычном редактировании.
        count.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        count.typeText(XCUIKeyboardKey.delete.rawValue + XCUIKeyboardKey.delete.rawValue + "345")
        let clipped = expectation(for: NSPredicate(format: "value == %@", "34"), evaluatedWith: count)
        wait(for: [clipped], timeout: 5)
        count.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        count.typeText(XCUIKeyboardKey.delete.rawValue + XCUIKeyboardKey.delete.rawValue + "3")
        let changed = expectation(for: NSPredicate(format: "value == %@", "3"), evaluatedWith: count)
        wait(for: [changed], timeout: 5)
        app.buttons["builder.topics"].tap()
        XCTAssertTrue(app.buttons["builder.topics.done"].waitForExistence(timeout: 5))
        let topics = app.switches.matching(NSPredicate(format: "identifier BEGINSWITH %@", "builder.topic."))
        XCTAssertGreaterThan(topics.count, 1)
        // В наборе для разработки здесь один средний вопрос; в остальных темах остаются ещё четыре.
        app.switches["builder.topic.cause-effect"].tap()
        app.segmentedControls["builder.difficulty"].buttons["Средняя"].tap()
        app.buttons["builder.topics.done"].tap()
        let retained = expectation(for: NSPredicate(format: "value == %@", "3"), evaluatedWith: count)
        wait(for: [retained], timeout: 5)
        XCTAssertTrue(app.buttons["builder.topics"].label.contains("Средняя"))
        XCTAssertTrue(app.buttons["builder.topics"].label.contains("2 из 3"))
        app.buttons["builder.topics"].tap()
        XCTAssertTrue(app.buttons["builder.topics.done"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.switches["builder.topic.cause-effect"].value as? String, "0")
        XCTAssertTrue(app.segmentedControls["builder.difficulty"].buttons["Средняя"].isSelected)
        app.buttons["builder.topics.done"].tap()
        XCTAssertTrue(app.buttons["builder.start"].label.contains("3 вопроса"))
        app.buttons["builder.start"].tap()
        XCTAssertTrue(app.otherElements["training.session"].waitForExistence(timeout: 10))
        app.terminate()

        let again = launch(reset: false, server: unreachableServer)
        let resume = again.buttons["today.continueTraining"]
        XCTAssertTrue(resume.waitForExistence(timeout: 10), "тренировка должна пережить перезапуск без сети")
        XCTAssertTrue(
            resume.label.replacingOccurrences(of: "\u{00A0}", with: " ").contains("вопрос 1 из 3"), resume.label)
        resume.tap()
        XCTAssertTrue(again.otherElements["training.session"].waitForExistence(timeout: 5))
        again.buttons["training.close"].tap()
        XCTAssertTrue(again.staticTexts["today.summary"].waitForExistence(timeout: 5))
    }

    func testTrainingClosePreservesTodayScroll() {
        let app = launch(reset: true, largeText: true)
        signIn(app)
        app.swipeUp()
        let entry = app.buttons["today.newTraining"]
        XCTAssertTrue(entry.isHittable)
        let originalY = entry.frame.midY
        entry.tap()
        XCTAssertTrue(app.buttons["builder.start"].waitForExistence(timeout: 10))
        app.buttons["training.close"].tap()
        XCTAssertTrue(entry.waitForExistence(timeout: 5))
        XCTAssertTrue(entry.isHittable)
        XCTAssertEqual(entry.frame.midY, originalY, accuracy: 2)
    }

    private func startSession(_ app: XCUIApplication, check: Bool = false, threeBlanks: Bool = false) {
        signIn(app)
        app.swipeUp()
        app.buttons["today.newTraining"].tap()
        XCTAssertTrue(app.buttons["builder.start"].waitForExistence(timeout: 10))
        let count = app.textFields["builder.count"]
        count.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        count.typeText(XCUIKeyboardKey.delete.rawValue + XCUIKeyboardKey.delete.rawValue + (threeBlanks ? "1" : "3"))
        if check { app.segmentedControls["builder.mode"].buttons["Проверка"].tap() }
        app.buttons["builder.topics"].tap()
        XCTAssertTrue(app.buttons["builder.topics.done"].waitForExistence(timeout: 5))
        // Контраст: в открытом наборе все ответы — A, у двух пропусков — A и D.
        app.switches[threeBlanks ? "builder.topic.contrast-signals" : "builder.topic.similarity-signals"].tap()
        app.switches["builder.topic.cause-effect"].tap()
        if threeBlanks { app.segmentedControls["builder.difficulty"].buttons["Трудная"].tap() }
        app.buttons["builder.topics.done"].tap()
        app.buttons["builder.start"].tap()
        XCTAssertTrue(app.staticTexts["session.progress"].waitForExistence(timeout: 10))
    }

    private func choose(_ app: XCUIApplication, correct: Bool) {
        let options = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "option."))
        XCTAssertTrue(options.firstMatch.waitForExistence(timeout: 5))
        let count = options.count
        app.buttons[correct ? "option.A" : "option.C"].tap()
        if count > 5 { app.buttons[correct ? "option.D" : "option.F"].tap() }
        if count > 6 { app.buttons[correct ? "option.G" : "option.I"].tap() }
    }

    private func capture(_ name: String) throws {
        if let path = ProcessInfo.processInfo.environment["GP_REVIEW_OUTPUT"] {
            let theme = ProcessInfo.processInfo.environment["GP_REVIEW_THEME"] ?? "light"
            let device = UIDevice.current.userInterfaceIdiom == .pad ? "ipad-landscape" : "iphone"
            try XCUIScreen.main.screenshot().pngRepresentation.write(
                to: URL(filePath: path).appending(path: "\(name)-\(device)-\(theme).png"))
        }
    }

    func testTrainingPracticeToSummary() throws {
        let app = launch(reset: true)
        if UIDevice.current.userInterfaceIdiom == .pad { XCUIDevice.shared.orientation = .landscapeLeft }
        startSession(app)
        try capture("question")
        choose(app, correct: true)
        app.buttons["question.check"].tap()
        XCTAssertTrue(app.staticTexts["explanation.verdict"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["explanation.verdict"].label, "Верно.")
        app.buttons["question.next"].tap()
        choose(app, correct: false)
        app.buttons["question.check"].tap()
        XCTAssertTrue(app.staticTexts["explanation.verdict"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["explanation.verdict"].label.hasPrefix("Неверно."))
        if !app.buttons["explanation.whyNotToggle"].isHittable { app.swipeUp() }
        app.buttons["explanation.whyNotToggle"].tap()
        XCTAssertTrue(app.staticTexts["explanation.whyNot"].firstMatch.waitForExistence(timeout: 5))
        if !app.staticTexts["explanation.whyNot"].firstMatch.isHittable { app.swipeUp() }
        try capture("explanation")
        app.segmentedControls["explanation.language"].buttons["EN"].tap()
        XCTAssertTrue(app.staticTexts["explanation.verdict"].label.hasPrefix("Incorrect."))
        app.segmentedControls["explanation.language"].buttons["RU"].tap()
        app.buttons["question.next"].tap()
        app.buttons["question.dontKnow"].tap()
        XCTAssertTrue(app.staticTexts["explanation.verdict"].waitForExistence(timeout: 5))
        app.buttons["question.next"].tap()
        XCTAssertTrue(app.buttons["summary.repeat"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Что повторить"].exists)
        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "из 3 верно")).firstMatch.exists)
        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "вопросы 2 и 3")).firstMatch.exists)
        try capture("summary")
        app.buttons["summary.done"].tap()
        XCTAssertTrue(app.buttons["today.newTraining"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["today.continueTraining"].exists)
        XCUIDevice.shared.orientation = .portrait
    }

    func testTrainingCheckSkipFlagReturnAndFinish() throws {
        let app = launch(reset: true)
        if UIDevice.current.userInterfaceIdiom == .pad { XCUIDevice.shared.orientation = .landscapeLeft }
        startSession(app, check: true)
        XCTAssertTrue(app.staticTexts["session.timer"].exists)
        app.buttons["question.flag"].tap()
        app.buttons["question.skip"].tap()
        choose(app, correct: true)
        app.buttons["question.next"].tap()
        app.buttons["question.next"].tap()
        XCTAssertTrue(app.buttons["overview.finish"].waitForExistence(timeout: 5))
        if UIDevice.current.userInterfaceIdiom == .pad {
            XCTAssertTrue(app.buttons["question.flag"].exists)
            // Оставляем ошибку для проверки повтора: после трёх верных ответов повторять нечего.
            choose(app, correct: false)
            XCTAssertTrue(app.buttons["option.C"].isSelected)
        }
        try capture("overview")
        XCTAssertTrue(app.buttons["overview.question.0"].value as? String == "без ответа, отмечен")
        app.buttons["overview.question.0"].tap()
        XCTAssertEqual(app.staticTexts["session.progress"].label, "Вопрос 1 из 3")
        choose(app, correct: true)
        app.buttons["question.overview"].tap()
        XCTAssertTrue(app.buttons["overview.question.0"].value as? String == "отвечен, отмечен")
        app.buttons["overview.finish"].tap()
        XCTAssertTrue(app.buttons["summary.done"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["session.timer"].exists)
        app.buttons["summary.repeat"].tap()
        XCTAssertTrue(app.staticTexts["session.progress"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["session.timer"].exists)
        app.buttons["training.close"].tap()
        XCUIDevice.shared.orientation = .portrait
    }

    func testTrainingCheckThreeBlanksCountOnlyCompleteAnswer() throws {
        let app = launch(reset: true)
        if UIDevice.current.userInterfaceIdiom == .pad { XCUIDevice.shared.orientation = .landscapeLeft }
        startSession(app, check: true, threeBlanks: true)
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "option.")).count, 9)
        app.buttons["option.A"].tap()
        app.buttons["question.overview"].tap()
        XCTAssertTrue(app.staticTexts["overview.status"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["overview.status"].label, "Отвечено 0 из 1 · отмечено 0")
        XCTAssertEqual(app.buttons["overview.question.0"].value as? String, "без ответа")
        try capture("overview-partial")
        if UIDevice.current.userInterfaceIdiom != .pad { app.buttons["overview.back"].tap() }
        for id in ["D", "G"] {
            let option = app.buttons["option.\(id)"]
            if !option.isHittable { app.swipeUp() }
            option.tap()
            XCTAssertTrue(option.isSelected)
        }
        app.buttons["question.overview"].tap()
        XCTAssertEqual(app.staticTexts["overview.status"].label, "Отвечено 1 из 1 · отмечено 0")
        XCTAssertEqual(app.buttons["overview.question.0"].value as? String, "отвечен")
        app.buttons["overview.finish"].tap()
        XCTAssertTrue(app.buttons["summary.done"].waitForExistence(timeout: 5))
        XCUIDevice.shared.orientation = .portrait
    }

    func testTrainingRelaunchResumesSameQuestionAndAnswerOffline() {
        let app = launch(reset: true)
        startSession(app, check: true)
        choose(app, correct: true)
        app.buttons["question.next"].tap()
        choose(app, correct: false)
        app.terminate()
        let offline = launch(reset: false, server: unreachableServer)
        XCTAssertTrue(offline.buttons["today.continueTraining"].waitForExistence(timeout: 10))
        offline.buttons["today.continueTraining"].tap()
        XCTAssertTrue(offline.staticTexts["session.progress"].waitForExistence(timeout: 5))
        XCTAssertEqual(offline.staticTexts["session.progress"].label, "Вопрос 2 из 3")
        XCTAssertTrue(offline.buttons["option.C"].isSelected)
        offline.buttons["question.overview"].tap()
        offline.buttons["overview.finish"].tap()
        XCTAssertTrue(offline.buttons["summary.repeat"].waitForExistence(timeout: 5))
    }

    func testTrainingReviewAnswersAndBack() throws {
        let keyboardRun = ProcessInfo.processInfo.environment["GP_REVIEW_KEYBOARD"] == "1"
        XCUIDevice.shared.orientation = .portrait
        defer { XCUIDevice.shared.orientation = .portrait }
        let app = launch(reset: true)
        if keyboardRun {
            try reviewKeyboard(app)
            return
        }
        startSession(app, check: true)
        try capture("question")
        choose(app, correct: true)
        app.buttons["question.next"].tap()
        choose(app, correct: false)
        app.buttons["question.next"].tap()
        app.buttons["question.next"].tap()
        app.buttons["overview.finish"].tap()
        XCTAssertTrue(app.buttons["summary.review"].waitForExistence(timeout: 5))
        try capture("summary")
        app.buttons["summary.review"].tap()
        XCTAssertTrue(app.buttons["review.item.0"].waitForExistence(timeout: 5))
        try capture("review")
        app.segmentedControls["review.filter"].buttons["Ошибки · 2"].tap()
        XCTAssertFalse(app.buttons["review.item.0"].exists)
        app.buttons["review.item.1"].tap()
        XCTAssertTrue(app.staticTexts["explanation.verdict"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["explanation.verdict"].label.hasPrefix("Неверно."))
        if !app.buttons["explanation.whyNotToggle"].isHittable { app.swipeUp() }
        app.buttons["explanation.whyNotToggle"].tap()
        XCTAssertTrue(app.staticTexts["explanation.whyNot"].firstMatch.waitForExistence(timeout: 5))
        try capture("review-question")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.buttons["review.item.1"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.buttons["summary.review"].waitForExistence(timeout: 5))
    }

    private func reviewKeyboard(_ app: XCUIApplication) throws {
        XCTAssertEqual(UIDevice.current.userInterfaceIdiom, .pad)
        signIn(app)
        app.swipeUp()
        app.buttons["today.newTraining"].tap()
        XCTAssertTrue(app.buttons["builder.start"].waitForExistence(timeout: 10))
        // Для клавиш достаточно штатной проверки: этот путь не зависит от редактирования числа вопросов.
        app.buttons["builder.preset.timed"].tap()
        app.buttons["builder.start"].tap()
        XCTAssertTrue(app.buttons["question.overview"].waitForExistence(timeout: 10))
        app.buttons["question.overview"].tap()
        app.buttons["overview.finish"].tap()
        XCTAssertTrue(app.buttons["summary.review"].waitForExistence(timeout: 5))
        XCUIDevice.shared.orientation = .landscapeLeft
        app.buttons["summary.review"].tap()
        XCTAssertTrue(app.buttons["review.item.0"].waitForExistence(timeout: 5))
        app.typeKey(.downArrow, modifierFlags: [])
        waitSelected(app.buttons["review.item.1"])
        app.typeKey(.return, modifierFlags: [])
        app.typeKey(.downArrow, modifierFlags: [])
        waitSelected(app.buttons["review.item.2"])
        app.typeKey(.upArrow, modifierFlags: [])
        waitSelected(app.buttons["review.item.1"])
        // Сессия под разбором не должна получать свои команды или возвращать себе фокус.
        app.typeKey(.rightArrow, modifierFlags: [])
        XCTAssertTrue(app.buttons["review.item.1"].isSelected)
        app.typeKey("a", modifierFlags: [])
        app.typeKey(.downArrow, modifierFlags: [])
        waitSelected(app.buttons["review.item.2"])
        app.typeKey(.upArrow, modifierFlags: [])
        waitSelected(app.buttons["review.item.1"])
        try capture("review-keyboard")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.buttons["summary.review"].waitForExistence(timeout: 5))
    }

    private func waitSelected(_ element: XCUIElement) {
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: "selected == true"), object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 5), .completed)
    }

    func testTrainingReviewReportAndCancel() throws {
        let app = launch(reset: true)
        startSession(app, check: true, threeBlanks: true)
        app.buttons["question.overview"].tap()
        app.buttons["overview.finish"].tap()
        XCTAssertTrue(app.buttons["summary.review"].waitForExistence(timeout: 5))
        app.buttons["summary.review"].tap()
        XCTAssertTrue(app.buttons["review.item.0"].waitForExistence(timeout: 5))
        app.buttons["review.item.0"].tap()
        XCTAssertTrue(app.buttons["question.report"].waitForExistence(timeout: 5))
        app.buttons["question.report"].tap()
        XCTAssertTrue(app.buttons["report.kind.translation"].waitForExistence(timeout: 5))
        try capture("report-review")
        app.buttons["report.kind.translation"].tap()
        app.buttons["report.cancel"].tap()
        XCTAssertTrue(app.buttons["question.report"].waitForExistence(timeout: 5))
        app.buttons["question.report"].tap()
        XCTAssertTrue(app.buttons["report.send"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["report.send"].isEnabled)
        app.buttons["report.cancel"].tap()
        XCTAssertTrue(app.buttons["question.report"].waitForExistence(timeout: 5))
    }

    private func reportText(_ app: XCUIApplication) -> XCUIElement {
        // SwiftUI представляет многострочный TextField как TextView на iOS 18 и TextField на iOS 27.
        // Идентификатор договора доступности один на обеих версиях системы.
        app.descendants(matching: .any).matching(identifier: "report.text").firstMatch
    }

    func testTrainingQuestionReportDraftAndSend() throws {
        userPrefix = "report-ui"
        let app = launch(reset: true)
        startSession(app)
        app.buttons["question.report"].tap()
        XCTAssertTrue(app.buttons["report.send"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["report.send"].isEnabled)
        try capture("report")
        app.buttons["report.kind.explanation"].tap()
        let text = reportText(app)
        XCTAssertTrue(text.waitForExistence(timeout: 5))
        text.tap()
        text.typeText("ui-report-fixture")
        app.terminate()
        let again = launch(reset: false)
        XCTAssertTrue(again.buttons["today.continueTraining"].waitForExistence(timeout: 10))
        again.buttons["today.continueTraining"].tap()
        XCTAssertTrue(again.buttons["question.report"].waitForExistence(timeout: 5))
        again.buttons["question.report"].tap()
        XCTAssertTrue(reportText(again).waitForExistence(timeout: 5))
        XCTAssertEqual(reportText(again).value as? String, "ui-report-fixture")
        XCTAssertTrue(again.buttons["report.kind.explanation"].isSelected)
        again.buttons["report.send"].tap()
        XCTAssertTrue(again.staticTexts["report.sent"].waitForExistence(timeout: 5))
        try capture("report-sent")
        again.buttons["report.back"].tap()
        XCTAssertTrue(again.buttons["question.check"].waitForExistence(timeout: 5))
        again.buttons["question.report"].tap()
        XCTAssertTrue(again.buttons["report.send"].waitForExistence(timeout: 5))
        XCTAssertFalse(again.buttons["report.send"].isEnabled)
        again.buttons["report.cancel"].tap()
        XCTAssertTrue(again.buttons["question.check"].waitForExistence(timeout: 5))
    }

    func testTrainingLayoutInBothOrientations() throws {
        let app = launch(reset: true)
        signIn(app)
        app.swipeUp()
        app.buttons["today.newTraining"].tap()
        XCTAssertTrue(app.buttons["builder.start"].waitForExistence(timeout: 10))
        let output = ProcessInfo.processInfo.environment["GP_REVIEW_OUTPUT"]
        let theme = ProcessInfo.processInfo.environment["GP_REVIEW_THEME"] ?? "light"
        let device = UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "iphone"
        let orientations: [(UIDeviceOrientation, String)] =
            UIDevice.current.userInterfaceIdiom == .pad
            ? [(.portrait, "portrait"), (.landscapeLeft, "landscape")] : [(.portrait, "portrait")]
        for (orientation, name) in orientations {
            XCUIDevice.shared.orientation = orientation
            XCTAssertTrue(app.buttons["builder.start"].isHittable)
            if name == "landscape" { XCTAssertGreaterThan(app.frame.width, app.frame.height) }
            if let output {
                try XCUIScreen.main.screenshot().pngRepresentation.write(
                    to: URL(filePath: output).appending(path: "builder-\(device)-\(name)-\(theme).png"))
            }
            app.buttons["builder.topics"].tap()
            XCTAssertTrue(app.buttons["builder.topics.done"].waitForExistence(timeout: 5))
            if let output {
                try XCUIScreen.main.screenshot().pngRepresentation.write(
                    to: URL(filePath: output).appending(path: "topics-\(device)-\(name)-\(theme).png"))
            }
            app.buttons["builder.topics.done"].tap()
        }
        if let output {
            app.buttons["builder.start"].tap()
            XCTAssertTrue(app.otherElements["training.session"].waitForExistence(timeout: 10))
            app.buttons["training.close"].tap()
            app.swipeDown()
            XCTAssertTrue(app.buttons["today.continueTraining"].waitForExistence(timeout: 5))
            for (orientation, name) in orientations {
                XCUIDevice.shared.orientation = orientation
                try XCUIScreen.main.screenshot().pngRepresentation.write(
                    to: URL(filePath: output).appending(path: "today-\(device)-\(name)-\(theme).png"))
            }
        }
        if output == nil { XCUIDevice.shared.orientation = .portrait }
    }
}
