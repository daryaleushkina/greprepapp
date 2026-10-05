import Foundation
import Testing

@testable import GrePrep

@Suite("API: запросы и разбор ответов")
struct APITests {
    let server = StubServer()

    func api(token: String? = "token-1") -> API {
        API(config: server.config(), session: server.session, tokens: MemoryTokenStore(token))
    }

    @Test("план дня приходит и читается")
    func todaySuccess() async throws {
        server.on("GET /api/today", .json(200, Fixture.todayJSON))
        let today = try await api().today()
        #expect(today.date == "2026-10-06")
        #expect(today.steps.map(\.id) == ["words", "verbal", "quant"])
    }

    @Test("незнакомое поле в ответе не ломает приложение — сервер обновляется раньше приложения")
    func toleratesUnknownFields() async throws {
        server.on("GET /api/today", .json(200, #"{"date":"2026-10-06","steps":[],"streak":3}"#))
        let today = try await api().today()
        #expect(today.steps.isEmpty)
    }

    @Test("токен сессии уходит в заголовке Authorization")
    func sendsBearerToken() async throws {
        server.on("GET /api/today", .json(200, Fixture.todayJSON))
        _ = try await api(token: "abc").today()
        #expect(server.requests("GET /api/today").first?.authorization == "Bearer abc")
    }

    @Test("без токена заголовка нет")
    func noTokenNoHeader() async throws {
        server.on("GET /api/today", .json(401, Fixture.error("unauthorized")))
        await #expect(throws: APIFailure.unauthorized) { try await api(token: nil).today() }
        #expect(server.requests("GET /api/today").first?.authorization == nil)
    }

    @Test("ошибка сервера — с кодом и id запроса")
    func serverError() async throws {
        server.on("GET /api/today", .json(500, Fixture.error("internal", requestID: "r-42")))
        await #expect(throws: APIFailure.server(status: 500, code: "internal", requestID: "r-42")) {
            try await api().today()
        }
    }

    @Test(
        "нет сети — offline",
        arguments: [URLError.Code.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost])
    func offline(code: URLError.Code) async throws {
        server.on("GET /api/today", .failure(code))
        await #expect(throws: APIFailure.offline) { try await api().today() }
    }

    @Test(
        "прокси ответил вместо сервера (502/503/504 без тела) — сервер недоступен, а не наша ошибка",
        arguments: [502, 503, 504])
    func proxyUnavailable(status: Int) async throws {
        server.on("GET /api/today", .status(status))
        await #expect(throws: APIFailure.offline) { try await api().today() }
    }

    @Test("чужой ответ не по договору — unexpected с HTTP-статусом для журнала")
    func foreignResponseKeepsStatus() async throws {
        server.on("GET /api/today", .status(418))
        await #expect {
            try await api().today()
        } throws: { error in
            guard case let .unexpected(message) = error as? APIFailure else { return false }
            return message.contains("HTTP 418")
        }
    }

    @Test("длинный отчёт режется по кодовым точкам, как считает сервер, а не по графемам")
    func reportTruncatesByUnicodeScalars() async throws {
        server.on("POST /api/client-errors", .status(204))
        // Флаг — одна графема из двух кодовых точек: 1500 флагов = 3000 точек.
        await api().reportClientError(message: String(repeating: "🇷🇺", count: 1500), route: "today", requestID: nil)
        let body = try #require(server.requests("POST /api/client-errors").first).json()
        let message = try #require(body["message"] as? String)
        #expect(message.unicodeScalars.count <= 2000)
    }

    @Test("ответ не по договору — unexpected, а не пустой успех")
    func malformedBody() async throws {
        server.on("GET /api/today", .json(200, #"{"date":"2026-10-06"}"#))
        await #expect {
            try await api().today()
        } throws: { error in
            if case .unexpected = error as? APIFailure { return true }
            return false
        }
    }

    @Test("вход подменой: токен в ответе, тело по договору")
    func developmentSignIn() async throws {
        server.on("POST /api/auth/dev", .json(200, Fixture.session(token: "t-dev")))
        let signedIn = try await api(token: nil).signInForDevelopment(name: "ui-test")
        #expect(signedIn.token == "t-dev")
        let body = try #require(server.requests("POST /api/auth/dev").first).json()
        #expect(body["name"] as? String == "ui-test")
        #expect(body["transport"] as? String == "bearer")
        #expect(body["clientKind"] as? String == "ios")
    }

    @Test("сессия без токена при transport=bearer — нарушение договора")
    func sessionWithoutToken() async throws {
        let noToken =
            #"{"expiresAt":"2026-11-05T00:00:00Z","user":{"id":"8f0c6c1e-5a43-4c1a-9b7e-0c4b1f2d3e4f","name":"x","role":"user","locale":"ru","identities":[]}}"#
        server.on("POST /api/auth/dev", .json(200, noToken))
        await #expect(throws: APIFailure.unexpected("session without token for bearer transport")) {
            try await api(token: nil).signInForDevelopment(name: "x")
        }
    }

    @Test("вход по id_token Apple: nonce и имя уходят на сервер")
    func idTokenSignIn() async throws {
        server.on("POST /api/auth/oidc", .json(200, Fixture.session()))
        _ = try await api(token: nil).signInWithIdToken(
            provider: .apple, idToken: "jwt", nonce: "n-123456789012345", displayName: "Даша")
        let body = try #require(server.requests("POST /api/auth/oidc").first).json()
        #expect(body["provider"] as? String == "apple")
        #expect(body["nonce"] as? String == "n-123456789012345")
        #expect(body["displayName"] as? String == "Даша")
    }

    @Test("вход по коду: verifier и адрес возврата уходят на сервер")
    func codeSignIn() async throws {
        server.on("POST /api/auth/oidc/code", .json(200, Fixture.session()))
        _ = try await api(token: nil).signInWithAuthorizationCode(
            provider: .telegram, code: "c", codeVerifier: String(repeating: "v", count: 43),
            redirectURI: "dev.greprepapp.app:/oauth", nonce: "n-123456789012345"
        )
        let body = try #require(server.requests("POST /api/auth/oidc/code").first).json()
        #expect(body["code"] as? String == "c")
        #expect(body["redirectUri"] as? String == "dev.greprepapp.app:/oauth")
    }

    @Test("ошибки входа по коду и id_token разбираются так же", arguments: ["/api/auth/oidc", "/api/auth/oidc/code"])
    func signInFailures(path: String) async throws {
        server.on("POST \(path)", .json(429, Fixture.error("too_many_requests")))
        await #expect(throws: APIFailure.server(status: 429, code: "too_many_requests", requestID: "req-1")) {
            if path.hasSuffix("code") {
                _ = try await api(token: nil).signInWithAuthorizationCode(
                    provider: .google, code: "c", codeVerifier: String(repeating: "v", count: 43),
                    redirectURI: "x:/y", nonce: "n-123456789012345"
                )
            } else {
                _ = try await api(token: nil).signInWithIdToken(
                    provider: .apple, idToken: "j", nonce: "n-123456789012345", displayName: nil)
            }
        }
    }

    @Test("выход: 204 — успех, ошибка — разбирается")
    func signOut() async throws {
        server.on("POST /api/auth/logout", .status(204), .json(500, Fixture.error("internal")))
        try await api().signOut()
        await #expect(throws: APIFailure.server(status: 500, code: "internal", requestID: "req-1")) {
            try await api().signOut()
        }
    }

    @Test("отчёт об ошибке не бросает, даже когда сервер недоступен")
    func reportClientError() async throws {
        server.on("POST /api/client-errors", .status(204), .failure(.notConnectedToInternet))
        await api().reportClientError(message: "boom", route: "today", requestID: "r-1")
        await api().reportClientError(message: "boom", route: "today", requestID: nil)
        let body = try #require(server.requests("POST /api/client-errors").first).json()
        #expect(body["message"] as? String == "boom")
        #expect(body["clientKind"] as? String == "ios")
        #expect(body["requestId"] as? String == "r-1")
        #expect(server.requests("POST /api/client-errors").count == 2)
    }
}

@Suite("APIFailure: что показывать человеку")
struct APIFailureTests {
    @Test("401 — сессии нет, независимо от кода")
    func unauthorized() {
        #expect(APIFailure.response(status: 401, code: "whatever", requestID: nil) == .unauthorized)
        #expect(APIFailure.response(status: 403, code: "unauthorized", requestID: nil) == .unauthorized)
        #expect(
            APIFailure.response(status: 403, code: nil, requestID: "r")
                == .server(status: 403, code: "http_403", requestID: "r"))
        #expect(
            APIFailure.response(status: 409, code: "conflict", requestID: "r")
                == .server(status: 409, code: "conflict", requestID: "r"))
    }

    @Test("отмена — не ошибка")
    func cancellation() {
        #expect(APIFailure(CancellationError()) == .cancelled)
        #expect(APIFailure(URLError(.cancelled)) == .cancelled)
    }

    @Test("в журнал — только наши сбои")
    func reportable() {
        #expect(!APIFailure.offline.isReportable)
        #expect(!APIFailure.unauthorized.isReportable)
        #expect(!APIFailure.cancelled.isReportable)
        #expect(!APIFailure.server(status: 400, code: "bad_request", requestID: nil).isReportable)
        #expect(APIFailure.server(status: 503, code: "x", requestID: nil).isReportable)
        #expect(APIFailure.unexpected("x").isReportable)
        #expect(APIFailure(URLError(.badURL)) == .unexpected("URLError \(URLError.Code.badURL.rawValue)"))
        #expect(APIFailure(APIFailure.offline) == .offline)
    }
}
