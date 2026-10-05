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

/// Keychain, который не отвечает (заблокированное устройство, сбой системы).
struct BrokenTokenStore: TokenStore {
    func token() throws -> String? { throw TokenStoreError(status: -25308) }
    func save(_ token: String) throws { throw TokenStoreError(status: -25308) }
    func clear() throws { throw TokenStoreError(status: -25308) }
}
