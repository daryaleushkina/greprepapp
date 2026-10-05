import Foundation

/// Настройки сборки: адрес сервера и провайдеры входа. Значения — из Info.plist (project.yml), не из кода.
struct AppConfig: Sendable {
    let apiBaseURL: URL
    let clientKind: ClientKindValue
    let appVersion: String
    /// Telegram и Google — системное окно браузера (OIDC с PKCE). Пусто — аккаунтов у провайдера ещё нет.
    let webProviders: [WebProvider: WebProviderConfig]

    /// Вид клиента для сервера: тот же enum, что в договоре (ClientKind), без зависимости от GPAPI.
    enum ClientKindValue: String, Sendable { case ios, macos }

    static func load(bundle: Bundle = .main, environment: [String: String] = ProcessInfo.processInfo.environment)
        -> AppConfig
    {
        let info = bundle.infoDictionary ?? [:]
        var base = (info["GPAPIBaseURL"] as? String).flatMap(URL.init(string:))
        #if DEBUG
            // Сценарии UI поднимают свой сервер на другом порту (scripts/hooks/gate-apple) и передают адрес
            // окружением запуска. В релизной сборке этой ветки нет.
            if let override = environment["GP_API_BASE_URL"].flatMap(URL.init(string:)) {
                base = override
            }
        #endif
        guard let base else {
            // Без адреса сервера приложение бесполезно, а адрес задаётся сборкой: это ошибка конфигурации,
            // а не состояние для человека.
            preconditionFailure("GPAPIBaseURL is missing in Info.plist (project.yml, GP_API_BASE_URL)")
        }
        #if os(macOS)
            let kind = ClientKindValue.macos
        #else
            let kind = ClientKindValue.ios
        #endif
        let short = info["CFBundleShortVersionString"] as? String ?? "0"
        let build = info["CFBundleVersion"] as? String ?? "0"
        var providers: [WebProvider: WebProviderConfig] = [:]
        for provider in WebProvider.allCases {
            if let config = WebProviderConfig(info: info, prefix: provider.infoPrefix) {
                providers[provider] = config
            }
        }
        return AppConfig(apiBaseURL: base, clientKind: kind, appVersion: "\(short) (\(build))", webProviders: providers)
    }

    /// Вход подменой (`/api/auth/dev`) — только в отладочной сборке; в бою сервер отвечает на этот путь 404.
    static var devSignInAvailable: Bool {
        #if DEBUG
            true
        #else
            false
        #endif
    }

    /// Хост юнит-тестов — это само приложение: при запуске под тестами оно не ходит в сеть и не читает Keychain.
    static var isRunningUnitTests: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }
}

/// Провайдеры, которые входят через системное окно браузера.
enum WebProvider: String, CaseIterable, Sendable {
    case telegram, google

    var infoPrefix: String {
        switch self {
        case .telegram: "GPOIDCTelegram"
        case .google: "GPOIDCGoogle"
        }
    }
}

/// Настройки OIDC одного провайдера: издатель (по нему — /.well-known/openid-configuration), client ID и
/// адрес возврата, зарегистрированный у провайдера.
struct WebProviderConfig: Sendable, Equatable {
    let issuer: URL
    let clientID: String
    let redirectURI: URL

    init(issuer: URL, clientID: String, redirectURI: URL) {
        self.issuer = issuer
        self.clientID = clientID
        self.redirectURI = redirectURI
    }

    init?(info: [String: Any], prefix: String) {
        guard
            let issuer = (info["\(prefix)Issuer"] as? String).flatMap(URL.init(string:)), issuer.scheme == "https",
            let clientID = info["\(prefix)ClientID"] as? String, !clientID.isEmpty,
            let redirect = (info["\(prefix)RedirectURI"] as? String).flatMap(URL.init(string:)), redirect.scheme != nil
        else { return nil }
        self.init(issuer: issuer, clientID: clientID, redirectURI: redirect)
    }
}
