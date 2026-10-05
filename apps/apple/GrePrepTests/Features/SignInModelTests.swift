import AuthenticationServices
import Foundation
import Testing

@testable import GrePrep

@MainActor
@Suite("Экран входа: способы входа и ответы человеку")
struct SignInModelTests {
    let server = StubServer()

    func setUp(webProviders: [WebProvider: WebProviderConfig] = [:]) -> (SignInModel, AppModel, MemoryTokenStore) {
        let tokens = MemoryTokenStore()
        let app = AppModel(
            config: server.config(webProviders: webProviders), tokens: tokens, cache: temporaryCache(),
            network: NetworkMonitor(), session: server.session
        )
        return (SignInModel(app: app, discoverySession: server.session), app, tokens)
    }

    @Test("вход подменой: токен в Keychain, человек на «Сегодня»")
    func development() async throws {
        server.on("POST /api/auth/dev", .json(200, Fixture.session(token: "t-1")))
        let (model, app, tokens) = setUp()
        await model.signInForDevelopment(name: "  ui-test  ")
        #expect(app.phase == .signedIn)
        #expect(try tokens.token() == "t-1")
        #expect(model.busy == nil)
        #expect(try server.requests("POST /api/auth/dev").first?.json()["name"] as? String == "ui-test")
    }

    @Test("пустое имя — запроса нет")
    func emptyName() async {
        let (model, _, _) = setUp()
        await model.signInForDevelopment(name: "   ")
        #expect(server.requests.isEmpty)
    }

    @Test(
        "ответы человеку по случаю",
        arguments: [
            (StubServer.Reply.failure(.notConnectedToInternet), SignInModel.Message.offline),
            (.json(429, Fixture.error("too_many_requests")), .tooManyAttempts),
            (.json(500, Fixture.error("internal")), .failed),
            (.json(400, Fixture.error("bad_request")), .failed),
        ])
    func messages(reply: StubServer.Reply, expected: SignInModel.Message) async {
        server.on("POST /api/auth/dev", reply)
        server.on("POST /api/client-errors", .status(204))
        let (model, app, _) = setUp()
        await model.signInForDevelopment(name: "x")
        #expect(model.message == expected)
        #expect(app.phase == .signedOut(nil))
    }

    @Test("Keychain не сохранил токен — «не получилось», а не вход без сессии")
    func keychainSaveFails() async {
        server.on("POST /api/auth/dev", .json(200, Fixture.session()))
        server.on("POST /api/client-errors", .status(204))
        let app = AppModel(
            config: server.config(), tokens: BrokenTokenStore(), cache: temporaryCache(), network: NetworkMonitor(),
            session: server.session)
        let model = SignInModel(app: app, discoverySession: server.session)
        await model.signInForDevelopment(name: "x")
        #expect(model.message == .failed)
        #expect(app.phase == .signedOut(nil))
    }

    @Test(
        "Telegram и Google без аккаунта у провайдера — честное «ещё не подключён»",
        arguments: [WebProvider.telegram, .google])
    func notConnectedYet(provider: WebProvider) async {
        let (model, _, _) = setUp()
        await model.signInWithWeb(provider) { _, _ in
            Issue.record("окно входа не должно открываться")
            return URL(string: "x:/")!
        }
        #expect(model.message == .notConnectedYet(provider == .telegram ? .telegram : .google))
    }

    func telegramConfig() -> WebProviderConfig {
        WebProviderConfig(
            issuer: URL(string: "https://\(server.host)/oidc")!,
            clientID: "client-1",
            redirectURI: URL(string: "dev.greprepapp.app:/oauth")!
        )
    }

    @Test("Telegram: окно входа с PKCE, код и verifier уходят на сервер")
    func webFlow() async throws {
        server.on(
            "GET /oidc/.well-known/openid-configuration",
            .json(200, #"{"authorization_endpoint":"https://oauth.example/auth"}"#))
        server.on("POST /api/auth/oidc/code", .json(200, Fixture.session(token: "t-tg")))
        let (model, app, tokens) = setUp(webProviders: [.telegram: telegramConfig()])
        var opened: URL?
        await model.signInWithWeb(.telegram) { url, redirect in
            opened = url
            #expect(redirect.absoluteString == "dev.greprepapp.app:/oauth")
            let state =
                URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "state" }?.value
                ?? ""
            return URL(string: "dev.greprepapp.app:/oauth?code=the-code&state=\(state)")!
        }
        let query = try #require(opened.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false)?.queryItems })
        #expect(query.first { $0.name == "code_challenge_method" }?.value == "S256")
        #expect(query.first { $0.name == "client_id" }?.value == "client-1")
        let body = try #require(server.requests("POST /api/auth/oidc/code").first).json()
        #expect(body["code"] as? String == "the-code")
        #expect(body["provider"] as? String == "telegram")
        #expect((body["codeVerifier"] as? String)?.count == 43)
        #expect(app.phase == .signedIn)
        #expect(try tokens.token() == "t-tg")
    }

    @Test("чужой state в ответе — вход не засчитывается")
    func stateMismatch() async {
        server.on(
            "GET /oidc/.well-known/openid-configuration",
            .json(200, #"{"authorization_endpoint":"https://oauth.example/auth"}"#))
        server.on("POST /api/client-errors", .status(204))
        let (model, app, _) = setUp(webProviders: [.telegram: telegramConfig()])
        await model.signInWithWeb(.telegram) { _, _ in URL(string: "dev.greprepapp.app:/oauth?code=c&state=forged")! }
        #expect(model.message == .failed)
        #expect(app.phase == .signedOut(nil))
        #expect(server.requests("POST /api/auth/oidc/code").isEmpty)
    }

    @Test("человек закрыл окно входа — без сообщения")
    func cancelled() async {
        server.on(
            "GET /oidc/.well-known/openid-configuration",
            .json(200, #"{"authorization_endpoint":"https://oauth.example/auth"}"#))
        let (model, _, _) = setUp(webProviders: [.telegram: telegramConfig()])
        await model.signInWithWeb(.telegram) { _, _ in throw ASWebAuthenticationSessionError(.canceledLogin) }
        #expect(model.message == nil)
        #expect(model.busy == nil)
    }

    @Test("описание провайдера недоступно: без сети — «нет сети», иначе — «не получилось»")
    func discoveryFailures() async {
        server.on(
            "GET /oidc/.well-known/openid-configuration", .failure(.notConnectedToInternet), .json(500, "{}"),
            .json(200, #"{"authorization_endpoint":"http://insecure/auth"}"#))
        server.on("POST /api/client-errors", .status(204))
        let (model, _, _) = setUp(webProviders: [.telegram: telegramConfig()])
        let never: (URL, URL) async throws -> URL = { _, _ in
            Issue.record("окно входа не должно открываться")
            return URL(string: "x:/")!
        }
        await model.signInWithWeb(.telegram, authenticate: never)
        #expect(model.message == .offline)
        await model.signInWithWeb(.telegram, authenticate: never)
        #expect(model.message == .failed)
        await model.signInWithWeb(.telegram, authenticate: never)
        #expect(model.message == .failed)
    }

    @Test("Apple: человек закрыл окно — без сообщения; другая ошибка — «не получилось»")
    func appleFailures() async {
        server.on("POST /api/client-errors", .status(204))
        let (model, _, _) = setUp()
        await model.completeApple(.failure(ASAuthorizationError(.canceled)))
        #expect(model.message == nil)
        await model.completeApple(.failure(ASAuthorizationError(.failed)))
        #expect(model.message == .failed)
    }
}

@Suite("PKCE и адрес возврата")
struct WebSignInTests {
    @Test("challenge S256 — пример из RFC 7636, приложение B")
    func rfcVector() {
        #expect(
            WebSignIn.codeChallenge(for: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
                == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }

    @Test("случайные строки: 43 символа base64url, каждый раз новые")
    func randomTokens() {
        let a = WebSignIn.randomToken()
        let b = WebSignIn.randomToken()
        #expect(a.count == 43)
        #expect(a != b)
        #expect(a.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" })
    }

    @Test("код берётся, только если state совпал и ошибки нет")
    func callback() throws {
        let ok = URL(string: "x:/cb?code=abc&state=s1")!
        #expect(try WebSignIn.code(from: ok, expectedState: "s1") == "abc")
        #expect(throws: WebSignIn.Failure.invalidCallback) { try WebSignIn.code(from: ok, expectedState: "s2") }
        #expect(throws: WebSignIn.Failure.invalidCallback) {
            try WebSignIn.code(from: URL(string: "x:/cb?error=access_denied&state=s1")!, expectedState: "s1")
        }
        #expect(throws: WebSignIn.Failure.invalidCallback) {
            try WebSignIn.code(from: URL(string: "x:/cb?state=s1")!, expectedState: "s1")
        }
    }

    @Test("адрес окна входа сохраняет параметры провайдера")
    func keepsExistingQuery() {
        let config = WebProviderConfig(
            issuer: URL(string: "https://i")!, clientID: "c", redirectURI: URL(string: "x:/cb")!)
        let attempt = WebSignIn.makeAttempt(
            authorizationEndpoint: URL(string: "https://p/auth?prompt=login")!, config: config)
        let items = URLComponents(url: attempt.url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        #expect(items.first { $0.name == "prompt" }?.value == "login")
        #expect(items.first { $0.name == "nonce" }?.value == attempt.nonce)
        #expect(
            items.first { $0.name == "code_challenge" }?.value == WebSignIn.codeChallenge(for: attempt.codeVerifier))
    }
}
