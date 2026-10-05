import Foundation
import Testing

@testable import GrePrep

@MainActor
@Suite("Вход и выход: что остаётся на устройстве")
struct AppModelTests {
    let server = StubServer()
    let cache = temporaryCache()

    func app(token: String? = nil, tokens: (any TokenStore)? = nil) -> (AppModel, any TokenStore) {
        let store = tokens ?? MemoryTokenStore(token)
        let app = AppModel(
            config: server.config(), tokens: store, cache: cache, network: NetworkMonitor(), session: server.session)
        return (app, store)
    }

    @Test("есть токен — сразу «Сегодня», без ожидания сети")
    func launchSignedIn() {
        let (app, _) = app(token: "t")
        #expect(app.phase == .signedIn)
        #expect(app.today != nil)
    }

    @Test("нет токена — экран входа")
    func launchSignedOut() {
        let (app, _) = app()
        #expect(app.phase == .signedOut(nil))
        #expect(app.today == nil)
    }

    @Test("Keychain не читается — экран входа и отчёт на сервер")
    func keychainFailure() async throws {
        server.on("POST /api/client-errors", .status(204))
        let (app, _) = app(tokens: BrokenTokenStore())
        #expect(app.phase == .signedOut(nil))
        await eventually { !server.requests("POST /api/client-errors").isEmpty }
        let body = try #require(server.requests("POST /api/client-errors").first).json()
        #expect((body["message"] as? String)?.contains("keychain") == true)
    }

    @Test("вход сохраняет токен и стирает план прошлого человека")
    func didSignIn() throws {
        try cache.save(Fixture.todayDTO)
        let (app, tokens) = app()
        try app.didSignIn(
            SignedIn(
                token: "new",
                user: try JSONDecoder().decode(
                    UserDTO.self,
                    from: Data(
                        #"{"id":"8f0c6c1e-5a43-4c1a-9b7e-0c4b1f2d3e4f","name":"x","role":"user","locale":"ru","identities":[]}"#
                            .utf8))))
        #expect(try tokens.token() == "new")
        #expect(cache.load() == nil)
        #expect(app.phase == .signedIn)
    }

    @Test("выход: токен и план стёрты сразу, сервер получает выход со старым токеном")
    func signOut() async throws {
        server.on("POST /api/auth/logout", .status(204))
        try cache.save(Fixture.todayDTO)
        let (app, tokens) = app(token: "old")
        app.signOut()
        #expect(app.phase == .signedOut(nil))
        #expect(app.today == nil)
        #expect(try tokens.token() == nil)
        #expect(cache.load() == nil)
        await eventually { !server.requests("POST /api/auth/logout").isEmpty }
        #expect(server.requests("POST /api/auth/logout").first?.authorization == "Bearer old")
    }

    @Test("сервер ответил 401 — вход закончился, человек видит почему")
    func unauthorizedFromToday() async throws {
        server.on("GET /api/today", .json(401, Fixture.error("unauthorized")))
        let (app, tokens) = app(token: "expired")
        await app.today?.refresh()
        #expect(app.phase == .signedOut(.sessionExpired))
        #expect(try tokens.token() == nil)
    }
}

@MainActor
@Suite("Поздние ответы и сбои Keychain")
struct AppModelLifecycleTests {
    let server = StubServer()
    let cache = temporaryCache()

    @Test("план, пришедший после выхода, не возвращается на устройство")
    func lateTodayAfterSignOut() async throws {
        let gate = StubServer.Gate()
        server.on("GET /api/today", .gated(gate, 200, Fixture.todayJSON))
        server.on("POST /api/auth/logout", .status(204))
        let app = AppModel(
            config: server.config(), tokens: MemoryTokenStore("old"), cache: cache, network: NetworkMonitor(),
            session: server.session)
        let model = try #require(app.today)
        let inFlight = Task { await model.refresh() }
        await eventually { !server.requests("GET /api/today").isEmpty }
        app.signOut()
        gate.open()
        await inFlight.value
        #expect(cache.load() == nil)
        #expect(app.phase == .signedOut(nil))
    }

    @Test("401 на запрос прошлого человека не выкидывает того, кто вошёл после")
    func late401AfterNewSignIn() async throws {
        let gate = StubServer.Gate()
        server.on("GET /api/today", .gated(gate, 401, Fixture.error("unauthorized")))
        server.on("POST /api/auth/logout", .status(204))
        let tokens = MemoryTokenStore("old")
        let app = AppModel(
            config: server.config(), tokens: tokens, cache: cache, network: NetworkMonitor(), session: server.session)
        let old = try #require(app.today)
        let inFlight = Task { await old.refresh() }
        await eventually { !server.requests("GET /api/today").isEmpty }
        app.signOut()
        try app.didSignIn(SignedIn(token: "new", user: Fixture.user))
        gate.open()
        await inFlight.value
        #expect(app.phase == .signedIn)
        #expect(try tokens.token() == "new")
    }

    @Test(
        "Keychain не ответил при запуске (до первой разблокировки) — вход восстанавливается, когда приложение откроют")
    func keychainRetryOnActivate() throws {
        let tokens = FlakyTokenStore(token: "t", failuresLeft: 1)
        server.on("POST /api/client-errors", .status(204))
        let app = AppModel(
            config: server.config(), tokens: tokens, cache: cache, network: NetworkMonitor(), session: server.session)
        #expect(app.phase == .signedOut(nil))
        app.retrySessionIfNeeded()
        #expect(app.phase == .signedIn)
        app.retrySessionIfNeeded()
        #expect(app.phase == .signedIn)
    }

    @Test("Keychain не стёр токен при выходе — вход всё равно не возвращается при следующем запуске")
    func signOutWhenClearFails() throws {
        server.on("POST /api/client-errors", .status(204))
        server.on("POST /api/auth/logout", .status(204))
        let tokens = UndeletableTokenStore(token: "t")
        let app = AppModel(
            config: server.config(), tokens: tokens, cache: cache, network: NetworkMonitor(), session: server.session)
        app.signOut()
        #expect(app.phase == .signedOut(nil))
        let relaunched = AppModel(
            config: server.config(), tokens: tokens, cache: cache, network: NetworkMonitor(), session: server.session)
        #expect(relaunched.phase == .signedOut(nil))
    }

    @Test("токен читается из Keychain один раз, а не на каждый запрос")
    func tokenIsCached() async throws {
        server.on("GET /api/today", .json(200, Fixture.todayJSON))
        let tokens = CountingTokenStore(token: "t")
        let app = AppModel(
            config: server.config(), tokens: tokens, cache: cache, network: NetworkMonitor(), session: server.session)
        let model = try #require(app.today)
        await model.refresh()
        await model.refresh()
        #expect(tokens.reads == 1)
        #expect(server.requests("GET /api/today").allSatisfy { $0.authorization == "Bearer t" })
    }
}

@Suite("Переустановка приложения")
struct FreshInstallTests {
    @Test("первый запуск после установки стирает токен прошлой установки из Keychain, следующие — нет")
    func clearsStaleTokenOnce() throws {
        let defaults = try #require(UserDefaults(suiteName: "dev.greprepapp.tests.\(UUID().uuidString)"))
        let tokens = MemoryTokenStore("from-previous-install")
        FreshInstall.forgetPreviousSession(tokens: tokens, defaults: defaults)
        #expect(try tokens.token() == nil)
        try tokens.save("current")
        FreshInstall.forgetPreviousSession(tokens: tokens, defaults: defaults)
        #expect(try tokens.token() == "current")
    }
}

/// Keychain, который первые разы отвечает ошибкой «устройство ещё не разблокировали» (−25308).
final class FlakyTokenStore: TokenStore, @unchecked Sendable {
    private let lock = NSLock()
    private var value: String?
    private var failuresLeft: Int

    init(token: String?, failuresLeft: Int) {
        value = token
        self.failuresLeft = failuresLeft
    }

    func token() throws -> String? {
        try lock.withLock {
            if failuresLeft > 0 {
                failuresLeft -= 1
                throw TokenStoreError(status: -25308)
            }
            return value
        }
    }

    func save(_ token: String) throws { lock.withLock { value = token } }
    func clear() throws { lock.withLock { value = nil } }
}

/// Keychain, который не может удалить запись, но может её перезаписать.
final class UndeletableTokenStore: TokenStore, @unchecked Sendable {
    private let lock = NSLock()
    private var value: String?

    init(token: String?) { value = token }

    func token() throws -> String? { lock.withLock { value } }
    func save(_ token: String) throws { lock.withLock { value = token } }
    func clear() throws { throw TokenStoreError(status: -25300) }
}

/// Считает чтения: каждое чтение Keychain на устройстве — обращение к системному сервису.
final class CountingTokenStore: TokenStore, @unchecked Sendable {
    private let lock = NSLock()
    private var value: String?
    private var count = 0

    init(token: String?) { value = token }

    var reads: Int { lock.withLock { count } }

    func token() throws -> String? {
        lock.withLock {
            count += 1
            return value
        }
    }

    func save(_ token: String) throws { lock.withLock { value = token } }
    func clear() throws { lock.withLock { value = nil } }
}

/// Keychain, который не отвечает (заблокированное устройство, сбой системы).
struct BrokenTokenStore: TokenStore {
    func token() throws -> String? { throw TokenStoreError(status: -25308) }
    func save(_ token: String) throws { throw TokenStoreError(status: -25308) }
    func clear() throws { throw TokenStoreError(status: -25308) }
}
