import Foundation
import Testing

@testable import GrePrep

@Suite("Хранилища на устройстве")
struct StorageTests {
    @Test("хранилище токена: сохранить, перезаписать, прочитать, стереть")
    func tokenStoreRoundTrip() throws {
        let keychain = KeychainTokenStore(service: "dev.greprepapp.tests.\(UUID().uuidString)")
        var stores: [any TokenStore] = []
        if keychain.isAvailable {
            stores.append(keychain)
        } else {
            #if os(macOS) && DEBUG
                // Mac без аккаунта разработчика: Keychain не пускает — проверяем файл, которым его заменяет live().
                #expect(throws: TokenStoreError(status: errSecMissingEntitlement)) { try keychain.save("x") }
                stores.append(
                    FileTokenStore(fileURL: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)))
            #else
                Issue.record("Keychain недоступен там, где должен быть")
            #endif
        }
        for store in stores {
            defer { try? store.clear() }
            #expect(try store.token() == nil)
            try store.save("first")
            try store.save("second")
            #expect(try store.token() == "second")
            try store.clear()
            #expect(try store.token() == nil)
            try store.clear()
        }
    }

    #if os(macOS) && DEBUG
        @Test("токен файлом находится и в папке с пробелом — как «Application Support»")
        func fileTokenStoreWithSpaceInPath() throws {
            let folder = FileManager.default.temporaryDirectory.appending(
                path: "Application Support \(UUID().uuidString)")
            let store = FileTokenStore(fileURL: folder.appending(path: "session-token"))
            defer { try? FileManager.default.removeItem(at: folder) }
            try store.save("t-1")
            #expect(try store.token() == "t-1")
            try store.clear()
            #expect(try store.token() == nil)
        }
    #endif

    @Test("кэш плана: сохранить, прочитать, стереть")
    func cacheRoundTrip() throws {
        let cache = temporaryCache()
        #expect(cache.load() == nil)
        try cache.save(Fixture.todayDTO)
        #expect(cache.load() == Fixture.todayDTO)
        cache.clear()
        #expect(cache.load() == nil)
    }
}

@Suite("Настройки сборки")
struct AppConfigTests {
    @Test("провайдер включается, только если всё задано и издатель — https")
    func webProvider() {
        let full: [String: Any] = [
            "PIssuer": "https://oauth.telegram.org", "PClientID": "id", "PRedirectURI": "dev.greprepapp.app:/oauth",
        ]
        #expect(WebProviderConfig(info: full, prefix: "P") != nil)
        var insecure = full
        insecure["PIssuer"] = "http://oauth.telegram.org"
        #expect(WebProviderConfig(info: insecure, prefix: "P") == nil)
        var noClient = full
        noClient["PClientID"] = ""
        #expect(WebProviderConfig(info: noClient, prefix: "P") == nil)
        #expect(WebProviderConfig(info: [:], prefix: "P") == nil)
    }

    @Test("сборка: адрес сервера из Info.plist, подмена окружением — только в отладке")
    func load() {
        let config = AppConfig.load(environment: [:])
        #expect(config.apiBaseURL.absoluteString == "http://127.0.0.1:8090")
        #expect(config.webProviders.isEmpty)
        let overridden = AppConfig.load(environment: ["GP_API_BASE_URL": "http://127.0.0.1:8091"])
        #expect(overridden.apiBaseURL.absoluteString == "http://127.0.0.1:8091")
        #expect(AppConfig.devSignInAvailable)
        #expect(AppConfig.isRunningUnitTests)
    }
}
