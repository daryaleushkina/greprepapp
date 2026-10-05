import Foundation
import Security

/// Где лежит токен сессии. В приложении — Keychain, в тестах — память.
protocol TokenStore: Sendable {
    func token() throws -> String?
    func save(_ token: String) throws
    func clear() throws
}

struct TokenStoreError: Error, Equatable {
    let status: OSStatus
}

/// Токен сессии в Keychain: только на этом устройстве (в резервную копию и на другое устройство не уходит)
/// и доступен после первой разблокировки — чтобы фоновое обновление не видело пустоту.
struct KeychainTokenStore: TokenStore {
    let service: String
    let account = "session"

    init(service: String = (Bundle.main.bundleIdentifier ?? "dev.greprepapp.app") + ".session") {
        self.service = service
    }

    /// Хранилище токена для приложения. Mac-сборку без аккаунта разработчика в Keychain как на iPhone не
    /// пускают (errSecMissingEntitlement, −34018), а старый Keychain входа после каждой пересборки спрашивает
    /// пароль. Аккаунт Apple — перед бетой (решение Даши 06.10.2026), поэтому до него отладочная сборка для Mac
    /// хранит токен файлом в своей папке. Релиз подписан аккаунтом и всегда идёт в Keychain.
    static func live() -> any TokenStore {
        let keychain = KeychainTokenStore()
        #if os(macOS) && DEBUG
            if !keychain.isAvailable {
                return FileTokenStore.live()
            }
        #endif
        return keychain
    }

    /// Пускает ли система в Keychain: проба записью и удалением.
    var isAvailable: Bool {
        var probe = query
        probe[kSecAttrAccount as String] = "probe"
        probe[kSecValueData as String] = Data("probe".utf8)
        let added = SecItemAdd(probe as CFDictionary, nil)
        probe.removeValue(forKey: kSecValueData as String)
        // Необязательный фон: убрать пробу; её может и не быть.
        _ = SecItemDelete(probe as CFDictionary)
        return added != errSecMissingEntitlement
    }

    private var query: [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        #if os(macOS)
            // Keychain как на iPhone, а не старый Keychain входа: без вопросов «разрешить доступ» после обновления.
            q[kSecUseDataProtectionKeychain as String] = true
        #endif
        return q
    }

    func token() throws -> String? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data, let token = String(data: data, encoding: .utf8) else {
                throw TokenStoreError(status: errSecDecode)
            }
            return token
        case errSecItemNotFound:
            return nil
        default:
            throw TokenStoreError(status: status)
        }
    }

    func save(_ token: String) throws {
        let update: [String: Any] = [
            kSecValueData as String: Data(token.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(query.merging(update) { _, new in new } as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw TokenStoreError(status: status) }
    }

    func clear() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw TokenStoreError(status: status)
        }
    }
}

#if os(macOS) && DEBUG
    /// Токен файлом — только отладочная сборка для Mac без аккаунта разработчика (KeychainTokenStore.live).
    /// Файл доступен только владельцу и лежит в папке приложения.
    struct FileTokenStore: TokenStore {
        let fileURL: URL

        static func live() -> FileTokenStore {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            let folder = Bundle.main.bundleIdentifier ?? "dev.greprepapp.app"
            return FileTokenStore(fileURL: base.appending(path: folder).appending(path: "session-token"))
        }

        func token() throws -> String? {
            guard FileManager.default.fileExists(atPath: fileURL.path(percentEncoded: false)) else { return nil }
            return try String(contentsOf: fileURL, encoding: .utf8)
        }

        func save(_ token: String) throws {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data(token.utf8).write(to: fileURL, options: .atomic)
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o600], ofItemAtPath: fileURL.path(percentEncoded: false))
        }

        func clear() throws {
            guard FileManager.default.fileExists(atPath: fileURL.path(percentEncoded: false)) else { return }
            try FileManager.default.removeItem(at: fileURL)
        }
    }
#endif

/// Токен в памяти — для тестов и превью.
final class MemoryTokenStore: TokenStore, @unchecked Sendable {
    // @unchecked: всё состояние — под замком.
    private let lock = NSLock()
    private var value: String?

    init(_ value: String? = nil) {
        self.value = value
    }

    func token() throws -> String? {
        lock.withLock { value }
    }

    func save(_ token: String) throws {
        lock.withLock { value = token }
    }

    func clear() throws {
        lock.withLock { value = nil }
    }
}
