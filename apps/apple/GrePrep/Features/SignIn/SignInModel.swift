import AuthenticationServices
import Foundation
import GPAPI
import Observation

/// Вход вне Telegram: Telegram, Apple, Google (PRODUCT.md, «Stack», вход) и подмена в отладочной сборке.
@MainActor
@Observable
final class SignInModel {
    enum Method: Hashable {
        case telegram, apple, google, development
    }

    /// Что сказать под кнопками. Без всплывающих окон: ответ рядом с тем, что нажали (PRODUCT.md, доступность).
    enum Message: Equatable {
        case notConnectedYet(Method)
        case offline
        case tooManyAttempts
        case failed
    }

    private(set) var busy: Method?
    private(set) var message: Message?

    @ObservationIgnored private let app: AppModel
    @ObservationIgnored private var appleNonce: String?
    @ObservationIgnored private let discoverySession: URLSession

    init(app: AppModel, discoverySession: URLSession = API.session) {
        self.app = app
        self.discoverySession = discoverySession
    }

    // MARK: - Подмена (только отладка)

    #if DEBUG
        func signInForDevelopment(name: String) async {
            let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty, begin(.development) else { return }
            defer { busy = nil }
            do {
                try finish(await app.api.signInForDevelopment(name: name))
            } catch {
                fail(error)
            }
        }
    #endif

    // MARK: - Apple

    /// Кнопка Apple просит запрос: nonce уходит в Apple и потом на сервер — сервер сверит его с id_token.
    func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = WebSignIn.randomToken()
        appleNonce = nonce
        request.requestedScopes = [.fullName]
        request.nonce = nonce
        message = nil
    }

    func completeApple(_ result: Result<ASAuthorization, any Error>) async {
        let nonce = appleNonce
        appleNonce = nil
        switch result {
        case let .failure(error):
            // Человек сам закрыл окно Apple — это не ошибка.
            if (error as? ASAuthorizationError)?.code == .canceled { return }
            // Без аккаунта разработчика у сборки нет права на вход с Apple, и система отказывает всегда:
            // честно сказать «ещё не подключён» и не засорять журнал ошибок (#6).
            guard app.config.appleSignInEnabled else {
                message = .notConnectedYet(.apple)
                return
            }
            app.report("apple sign-in: \(error)", route: "sign-in")
            message = .failed
        case let .success(authorization):
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential
            await signInWithApple(
                identityToken: credential?.identityToken, fullName: credential?.fullName, nonce: nonce)
        }
    }

    /// Ответ Apple: id_token и nonce, ушедший в Apple, — на сервер; имя — только при первом входе (в id_token его
    /// нет). Без токена или nonce (повтор без запроса) — «не получилось».
    func signInWithApple(identityToken: Data?, fullName: PersonNameComponents?, nonce: String?) async {
        guard let identityToken, let idToken = String(data: identityToken, encoding: .utf8), let nonce else {
            app.report("apple sign-in: credential without identity token or nonce", route: "sign-in")
            message = .failed
            return
        }
        guard begin(.apple) else { return }
        defer { busy = nil }
        let name = fullName.map { PersonNameComponentsFormatter().string(from: $0) }?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try finish(
                await app.api.signInWithIdToken(
                    provider: .apple, idToken: idToken, nonce: nonce,
                    displayName: name?.isEmpty == false ? name : nil
                ))
        } catch {
            fail(error)
        }
    }

    // MARK: - Telegram и Google

    /// authenticate — системное окно входа (WebAuthenticationSession из SwiftUI); в тестах — подмена.
    func signInWithWeb(
        _ provider: WebProvider,
        authenticate: (URL, URL) async throws -> URL
    ) async {
        let method: Method = provider == .telegram ? .telegram : .google
        guard let config = app.config.webProviders[provider] else {
            // Аккаунтов у провайдеров ещё нет (ROADMAP §2): кнопка есть, вход — когда Даша их заведёт.
            message = .notConnectedYet(method)
            return
        }
        guard begin(method) else { return }
        defer { busy = nil }
        let attempt: WebSignIn.Attempt
        do {
            let endpoint = try await WebSignIn.authorizationEndpoint(issuer: config.issuer, session: discoverySession)
            attempt = WebSignIn.makeAttempt(authorizationEndpoint: endpoint, config: config)
        } catch {
            if error == .offline {
                message = .offline
            } else {
                message = .failed
                app.report("\(provider) discovery failed: \(error)", route: "sign-in")
            }
            return
        }
        let callback: URL
        do {
            callback = try await authenticate(attempt.url, attempt.redirectURI)
        } catch {
            // Закрыл окно — не ошибка; остальное — в журнал.
            if (error as? ASWebAuthenticationSessionError)?.code != .canceledLogin {
                app.report("\(provider) web auth: \(error)", route: "sign-in")
                message = .failed
            }
            return
        }
        do {
            let code = try WebSignIn.code(from: callback, expectedState: attempt.state)
            try finish(
                await app.api.signInWithAuthorizationCode(
                    provider: provider == .telegram ? .telegram : .google,
                    code: code, codeVerifier: attempt.codeVerifier,
                    redirectURI: attempt.redirectURI.absoluteString, nonce: attempt.nonce
                ))
        } catch {
            fail(error)
        }
    }

    // MARK: - Общее

    /// Один вход за раз: вторая кнопка во время первого входа ничего не делает.
    private func begin(_ method: Method) -> Bool {
        guard busy == nil else { return false }
        busy = method
        message = nil
        return true
    }

    private func finish(_ signedIn: SignedIn) throws {
        try app.didSignIn(signedIn)
    }

    private func fail(_ error: any Error) {
        let failure = APIFailure(error)
        switch failure {
        case .cancelled:
            return
        case .offline:
            message = .offline
        case let .server(_, code, _) where code == "too_many_requests":
            message = .tooManyAttempts
        default:
            if failure.isReportable {
                app.report("sign-in: \(failure)", route: "sign-in", requestID: failure.requestID)
            }
            message = .failed
        }
    }
}
