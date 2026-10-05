import Foundation
import GPAPI
import OSLog

typealias TodayDTO = Components.Schemas.Today
typealias UserDTO = Components.Schemas.User

/// Успешный вход: токен уходит в Keychain, пользователь — на экран.
struct SignedIn: Sendable, Equatable {
    let token: String
    let user: UserDTO
}

/// Запросы приложения к серверу. Каждый метод отвечает либо данными, либо APIFailure — экран не видит
/// ни HTTP, ни генератора.
struct API: Sendable {
    private let client: Client
    private let clientKind: Components.Schemas.ClientKind
    private let appVersion: String

    init(config: AppConfig, session: URLSession = API.session, tokens: any TokenStore) {
        client = GPAPIClient.make(baseURL: config.apiBaseURL, session: session) {
            // Нечитаемый Keychain — то же, что «токена нет»: запрос уйдёт без входа, сервер ответит 401, и
            // человек увидит экран входа. Сама ошибка Keychain уже записана при старте (AppModel).
            (try? tokens.token()) ?? nil
        }
        clientKind = config.clientKind == .macos ? .macos : .ios
        appVersion = config.appVersion
    }

    /// Свой URLSession: без кук и кэша (токен — только в заголовке), каждый запрос — со сроком
    /// (CLAUDE.md, «Многопоточность»). Ждать сеть не нужно: экран сам покажет «Нет сети» и повторит.
    static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 30
        configuration.waitsForConnectivity = false
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        return URLSession(configuration: configuration)
    }()

    // MARK: - Вход

    #if DEBUG
        /// Вход подменой (`/api/auth/dev`) — только отладочная сборка: в релизе этого кода нет, а сервер в бою
        /// отвечает на путь 404.
        func signInForDevelopment(name: String) async throws(APIFailure) -> SignedIn {
            let output = try await call {
                try await client.signInForDevelopment(
                    body: .json(.init(name: name, transport: .bearer, clientKind: clientKind)))
            }
            switch output {
            case let .ok(ok):
                guard case let .json(session) = ok.body else { throw .unexpected("dev sign-in: unexpected body") }
                return try signedIn(session)
            case let .default(status, error):
                throw failure(status, error)
            }
        }
    #endif

    func signInWithIdToken(
        provider: Components.Schemas.IdentityProvider,
        idToken: String,
        nonce: String,
        displayName: String?
    ) async throws(APIFailure) -> SignedIn {
        let body = Components.Schemas.IdTokenSignIn(
            provider: provider, idToken: idToken, nonce: nonce, displayName: displayName,
            transport: .bearer, clientKind: clientKind
        )
        let output = try await call { try await client.signInWithIdToken(body: .json(body)) }
        switch output {
        case let .ok(ok):
            guard case let .json(session) = ok.body else { throw .unexpected("id token sign-in: unexpected body") }
            return try signedIn(session)
        case let .default(status, error):
            throw failure(status, error)
        }
    }

    func signInWithAuthorizationCode(
        provider: Components.Schemas.IdentityProvider,
        code: String,
        codeVerifier: String,
        redirectURI: String,
        nonce: String
    ) async throws(APIFailure) -> SignedIn {
        let body = Components.Schemas.AuthorizationCodeSignIn(
            provider: provider, code: code, codeVerifier: codeVerifier, redirectUri: redirectURI, nonce: nonce,
            transport: .bearer, clientKind: clientKind
        )
        let output = try await call { try await client.signInWithAuthorizationCode(body: .json(body)) }
        switch output {
        case let .ok(ok):
            guard case let .json(session) = ok.body else { throw .unexpected("code sign-in: unexpected body") }
            return try signedIn(session)
        case let .default(status, error):
            throw failure(status, error)
        }
    }

    func signOut() async throws(APIFailure) {
        let output = try await call { try await client.signOut() }
        switch output {
        case .noContent:
            return
        case let .default(status, error):
            throw failure(status, error)
        }
    }

    // MARK: - Данные

    func today() async throws(APIFailure) -> TodayDTO {
        let output = try await call { try await client.getToday() }
        switch output {
        case let .ok(ok):
            guard case let .json(today) = ok.body else { throw .unexpected("today: unexpected body") }
            return today
        case let .default(status, error):
            throw failure(status, error)
        }
    }

    /// Ошибка на устройстве — в таблицу client_errors. Не бросает: отчёт об ошибке не должен сам стать ошибкой
    /// на экране; не дошёл — значит, нет сети, и сообщить всё равно некуда.
    func reportClientError(message: String, route: String, requestID: String?) async {
        let body = Components.Schemas.ClientError(
            message: Self.prefix(message, 2000),
            route: Self.prefix(route, 512),
            requestId: requestID.map { Self.prefix($0, 64) },
            clientKind: clientKind,
            appVersion: appVersion,
            occurredAt: Date()
        )
        do {
            if case .noContent = try await client.reportClientError(body: .json(body)) { return }
            Self.log.error("client error report rejected by server")
        } catch {
            // Без сети отчёт не дойдёт — это ожидаемо; в системный журнал, чтобы сломанный канал было видно.
            Self.log.error("client error report failed: \(String(describing: error), privacy: .public)")
        }
    }

    private static let log = Logger(subsystem: "dev.greprepapp.app", category: "client-errors")

    /// Обрезка по кодовым точкам: сервер (ogen) считает длину строки так, а не по графемам — иначе флаг или
    /// эмодзи из нескольких точек сделали бы отчёт длиннее предела, и сервер отклонил бы его.
    static func prefix(_ text: String, _ limit: Int) -> String {
        String(String.UnicodeScalarView(text.unicodeScalars.prefix(limit)))
    }

    // MARK: - Разбор

    private func call<T>(_ request: () async throws -> T) async throws(APIFailure) -> T {
        do {
            return try await request()
        } catch {
            throw APIFailure(error)
        }
    }

    private func signedIn(_ session: Components.Schemas.Session) throws(APIFailure) -> SignedIn {
        // transport=bearer обязан вернуть токен в теле; нет его — сервер нарушил договор.
        guard let token = session.token, !token.isEmpty else {
            throw .unexpected("session without token for bearer transport")
        }
        return SignedIn(token: token, user: session.user)
    }

    private func failure(_ status: Int, _ response: Components.Responses._Error) -> APIFailure {
        guard case let .json(error) = response.body else {
            return .response(status: status, code: nil, requestID: nil)
        }
        return .response(status: status, code: error.code, requestID: error.requestId)
    }
}
