import Foundation
import Observation

/// Корень состояния: вошёл человек или нет, и общие на всё приложение части (сеть, сервер, Keychain).
@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable {
        case signedOut(SignOutReason?)
        case signedIn
    }

    /// Почему человек снова на экране входа — чтобы не гадал, куда делся вход.
    enum SignOutReason: Equatable {
        case sessionExpired
    }

    private(set) var phase: Phase
    /// Экран «Сегодня» живёт, пока человек вошёл: выход сбрасывает его вместе с данными.
    private(set) var today: TodayModel?

    let api: API
    let config: AppConfig
    let network: NetworkMonitor
    @ObservationIgnored private let tokens: any TokenStore
    @ObservationIgnored private let cache: TodayCache
    @ObservationIgnored private let makeAPI: @Sendable (_ token: String) -> API

    init(
        config: AppConfig,
        tokens: any TokenStore,
        cache: TodayCache,
        network: NetworkMonitor,
        session: URLSession = API.session
    ) {
        self.config = config
        self.tokens = tokens
        self.cache = cache
        self.network = network
        api = API(config: config, session: session, tokens: tokens)
        makeAPI = { token in API(config: config, session: session, tokens: MemoryTokenStore(token)) }
        phase = .signedOut(nil)

        // Вход живёт в Keychain: открыл приложение — сразу «Сегодня», без ожидания сети. Протух — первый же
        // запрос ответит 401 и вернёт на вход (handleUnauthorized).
        do {
            if try tokens.token() != nil {
                becomeSignedIn()
            }
        } catch {
            report("keychain read failed: \(error)", route: "launch")
        }
    }

    static func live() -> AppModel {
        AppModel(
            config: .load(),
            tokens: KeychainTokenStore.live(),
            cache: .live(),
            network: .live()
        )
    }

    #if DEBUG
        /// Чистое устройство для сценариев UI (аргумент запуска -GPResetState, только отладочная сборка).
        static func resetLocalState() {
            // Необязательный фон: стереть то, чего может и не быть.
            _ = try? KeychainTokenStore.live().clear()
            TodayCache.live().clear()
        }
    #endif

    /// Вход прошёл: токен — в Keychain, данные прошлого человека — прочь.
    func didSignIn(_ signedIn: SignedIn) throws {
        try tokens.save(signedIn.token)
        cache.clear()
        becomeSignedIn()
    }

    /// Выход: на устройстве — сразу и до конца (токен, план), на сервере — следом, без ожидания. Не дошло до
    /// сервера (нет сети) — токена на устройстве уже нет, а сессия на сервере истечёт сама.
    func signOut() {
        let token = try? tokens.token()
        forgetSession(reason: nil)
        if let token {
            let api = makeAPI(token)
            Task {
                // Необязательный фон: на устройстве человек уже вышел, сервер — уборка.
                _ = try? await api.signOut()
            }
        }
    }

    /// Сервер ответил 401: сессии больше нет (истекла или вышли на другом устройстве).
    func handleUnauthorized() {
        forgetSession(reason: .sessionExpired)
    }

    /// Ошибка на устройстве — на сервер, в client_errors, не задерживая экран.
    func report(_ message: String, route: String, requestID: String? = nil) {
        let api = api
        Task { await api.reportClientError(message: message, route: route, requestID: requestID) }
    }

    private func becomeSignedIn() {
        today = TodayModel(
            api: api,
            cache: cache,
            onUnauthorized: { [weak self] in self?.handleUnauthorized() },
            report: { [weak self] message, requestID in self?.report(message, route: "today", requestID: requestID) }
        )
        phase = .signedIn
    }

    private func forgetSession(reason: SignOutReason?) {
        do {
            try tokens.clear()
        } catch {
            report("keychain clear failed: \(error)", route: "sign-out")
        }
        cache.clear()
        today = nil
        phase = .signedOut(reason)
    }
}
