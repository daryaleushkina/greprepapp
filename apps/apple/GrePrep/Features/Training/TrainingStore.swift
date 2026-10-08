import CryptoKit
import Foundation

/// По файлу на тренировку. Доступ только из TrainingRepository; атомарная запись сохраняет прошлый файл при сбое.
final class TrainingStore: @unchecked Sendable {
    let directory: URL
    // Подготовка общая для копий ссылки и синхронной отметки выхода; после clear каталог создаётся заново.
    private let lock = NSLock()
    private var prepared = false

    init(directory: URL) { self.directory = directory }

    static func live(beside cache: TodayCache = .live()) -> TrainingStore {
        TrainingStore(directory: cache.fileURL.deletingLastPathComponent().appending(path: "trainings"))
    }
    private var ownerURL: URL { directory.appending(path: "owner.json") }
    private var clearURL: URL { directory.appending(path: "clear-pending") }
    private var retiredURL: URL { directory.appendingPathExtension("clearing") }
    var requiresClear: Bool { FileManager.default.fileExists(atPath: clearURL.path) }

    /// Маленькая запись до смены экрана: даже завершение процесса сразу после выхода не вернёт очередь.
    /// Сами большие файлы удалит actor, а при оборванном выходе — следующая загрузка.
    func markClear() throws {
        guard FileManager.default.fileExists(atPath: directory.path) else { return }
        try write(Data(), to: clearURL)
    }
    private struct Identity: Codable {
        let ownerID: String
        let credentialID: String?
    }

    static func credentialID(_ token: String) -> String {
        SHA256.hash(data: Data(token.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func owner() throws -> String? {
        guard FileManager.default.fileExists(atPath: ownerURL.path) else { return nil }
        return try identity()?.ownerID
    }

    func credentialID() throws -> String? { try identity()?.credentialID }

    private func identity() throws -> Identity? {
        guard FileManager.default.fileExists(atPath: ownerURL.path) else { return nil }
        // В отличие от задания, потерянная запись владельца запрещает всю очередь. До успешного clear
        // оставляем её на месте: повторный запуск тоже должен обнаружить повреждение.
        return try JSONDecoder().decode(Identity.self, from: Data(contentsOf: ownerURL))
    }

    func load(report: (String) -> Void) throws -> [String: StoredTraining] {
        // Если процесс оборвался после перемещения, эти файлы уже отозваны и никогда не загружаются.
        try removeIfPresent(retiredURL)
        if requiresClear {
            try clear()
            return [:]
        }
        guard FileManager.default.fileExists(atPath: directory.path) else { return [:] }
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        var all: [String: StoredTraining] = [:]
        for file in files where file.lastPathComponent.hasSuffix(".training.json") {
            do {
                let training = try JSONDecoder().decode(StoredTraining.self, from: Data(contentsOf: file))
                guard UUID(uuidString: training.id) != nil,
                    file.lastPathComponent == training.id + ".training.json",
                    training.total > 0,
                    training.session.items.enumerated().allSatisfy({ $0.offset == $0.element.position }),
                    (0..<training.total).contains(training.position),
                    training.unsent.allSatisfy({ training.answers[$0] != nil }),
                    training.answers.allSatisfy({ $0.key == $0.value.position && (0..<training.total).contains($0.key) }
                    )
                else { throw TrainingStorageError.invalidRecord }
                all[training.id] = training
            } catch {
                // Ни содержимого, ни пути в отчёте: здесь платные задания и ответы человека.
                report("training file unreadable: \(Self.reason(error))")
                let broken = file.appendingPathExtension("\(UUID().uuidString).broken")
                try FileManager.default.moveItem(at: file, to: broken)
            }
        }
        return all
    }

    func save(_ training: StoredTraining) throws {
        guard UUID(uuidString: training.id) != nil else { throw TrainingStorageError.invalidRecord }
        try write(JSONEncoder().encode(training), to: file(training.id))
    }

    func saveOwner(_ ownerID: String, credentialID: String? = nil) throws {
        try write(JSONEncoder().encode(Identity(ownerID: ownerID, credentialID: credentialID)), to: ownerURL)
    }

    func remove(_ id: String) throws {
        guard UUID(uuidString: id) != nil else { throw TrainingStorageError.invalidRecord }
        try removeIfPresent(file(id))
    }

    func clear() throws {
        try lock.withLock {
            try removeIfPresent(retiredURL)
            if FileManager.default.fileExists(atPath: directory.path) {
                // Рекурсивное removeItem могло стереть владельца и остановиться на одном из заданий.
                // Переименование атомарно отзывает весь каталог до удаления любого его содержимого.
                try FileManager.default.moveItem(at: directory, to: retiredURL)
            }
            prepared = false
            try removeIfPresent(retiredURL)
        }
    }

    private func file(_ id: String) -> URL { directory.appending(path: id + ".training.json") }

    private func write(_ data: Data, to url: URL) throws {
        try lock.withLock {
            if !prepared {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                var folder = directory
                var values = URLResourceValues()
                values.isExcludedFromBackup = true
                try folder.setResourceValues(values)
                prepared = true
            }
            #if os(iOS)
                try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            #else
                try data.write(to: url, options: .atomic)
            #endif
        }
    }

    private func removeIfPresent(_ url: URL) throws {
        do { try FileManager.default.removeItem(at: url) } catch CocoaError.fileNoSuchFile { return }
    }

    static func reason(_ error: any Error) -> String {
        let failure = error as NSError
        return "\(failure.domain) \(failure.code)"
    }
}

enum TrainingStorageError: Error { case invalidRecord }

/// Выход отзывает доступ синхронно, ещё до задачи actor. Проверка и запись под тем же замком:
/// поздний ответ сервера никогда не вернёт данные вышедшего на диск.
final class TrainingAccess: @unchecked Sendable {
    private let lock = NSLock()
    private var revision = 0

    func renew() -> Int {
        lock.withLock {
            revision += 1
            return revision
        }
    }
    func isCurrent(_ value: Int) -> Bool { lock.withLock { revision == value } }
    @discardableResult
    func withCurrent<T>(_ value: Int, _ action: () throws -> T) rethrows -> T? {
        try lock.withLock {
            guard revision == value else { return nil }
            return try action()
        }
    }
}
