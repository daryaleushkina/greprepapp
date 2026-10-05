import AuthenticationServices
import CryptoKit
import Foundation

/// Вход через системное окно браузера (Telegram, Google): OIDC, код авторизации с PKCE (RFC 7636). Код
/// меняется на id_token на сервере — секрет клиента на устройство не попадает (api/openapi.yaml,
/// /api/auth/oidc/code).
enum WebSignIn {
    /// Всё, что нужно запомнить между открытием окна и возвратом из него.
    struct Attempt: Equatable, Sendable {
        let url: URL
        let state: String
        let nonce: String
        let codeVerifier: String
        let redirectURI: URL
    }

    enum Failure: Error, Equatable {
        /// В ответе провайдера нет кода, чужой state или ошибка от провайдера.
        case invalidCallback
        /// Описание провайдера не получить или оно не по стандарту — с причиной для журнала.
        case discovery(String)
        /// До провайдера не достучаться.
        case offline
    }

    /// Случайная строка для state, nonce и PKCE: 32 байта из системного генератора, base64url без `=`.
    static func randomToken(bytes: Int = 32) -> String {
        var data = Data(count: bytes)
        let status = data.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, bytes, $0.baseAddress!) }
        precondition(status == errSecSuccess, "SecRandomCopyBytes failed: \(status)")
        return base64URL(data)
    }

    /// PKCE S256: challenge = base64url(SHA-256(verifier)).
    static func codeChallenge(for verifier: String) -> String {
        base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    static func makeAttempt(authorizationEndpoint: URL, config: WebProviderConfig) -> Attempt {
        let verifier = randomToken()
        let state = randomToken()
        let nonce = randomToken()
        var components = URLComponents(url: authorizationEndpoint, resolvingAgainstBaseURL: false)
        var items = components?.queryItems ?? []
        items += [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: config.clientID),
            URLQueryItem(name: "redirect_uri", value: config.redirectURI.absoluteString),
            URLQueryItem(name: "scope", value: "openid profile"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "nonce", value: nonce),
            URLQueryItem(name: "code_challenge", value: codeChallenge(for: verifier)),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ]
        components?.queryItems = items
        guard let url = components?.url else {
            preconditionFailure("authorization endpoint is not a valid URL: \(authorizationEndpoint)")
        }
        return Attempt(url: url, state: state, nonce: nonce, codeVerifier: verifier, redirectURI: config.redirectURI)
    }

    /// Код из адреса возврата. state обязан совпасть: иначе это ответ на чужой запрос (подмена входа, CSRF).
    static func code(from callback: URL, expectedState: String) throws(Failure) -> String {
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String? { items.first { $0.name == name }?.value }
        guard value("error") == nil, value("state") == expectedState, let code = value("code"), !code.isEmpty else {
            throw .invalidCallback
        }
        return code
    }

    /// Адрес страницы входа провайдера — из его описания OIDC; только https.
    static func authorizationEndpoint(issuer: URL, session: URLSession) async throws(Failure) -> URL {
        struct Discovery: Decodable {
            let authorizationEndpoint: String
            enum CodingKeys: String, CodingKey { case authorizationEndpoint = "authorization_endpoint" }
        }
        let url = issuer.appending(path: ".well-known/openid-configuration")
        do {
            let (data, response) = try await session.data(from: url)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard status == 200 else { throw Failure.discovery("status \(status)") }
            let discovery = try JSONDecoder().decode(Discovery.self, from: data)
            guard let endpoint = URL(string: discovery.authorizationEndpoint), endpoint.scheme == "https" else {
                throw Failure.discovery("authorization_endpoint is not https")
            }
            return endpoint
        } catch let failure as Failure {
            throw failure
        } catch {
            throw APIFailure(error) == .offline ? .offline : .discovery(String(describing: error))
        }
    }

    /// Как окно входа узнаёт возврат: https — по хосту и пути (связанный домен), иначе — по своей схеме.
    static func callback(for redirect: URL) -> ASWebAuthenticationSession.Callback {
        if redirect.scheme == "https", let host = redirect.host() {
            let path = redirect.path(percentEncoded: false)
            return .https(host: host, path: path.isEmpty ? "/" : path)
        }
        return .customScheme(redirect.scheme ?? "")
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
