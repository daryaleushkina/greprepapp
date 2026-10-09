import CryptoKit
import Foundation

/// По файлу на тренировку; черновики TrainingModel пишет синхронно под замком. Записи атомарные.
final class TrainingStore: @unchecked Sendable {
    let directory: URL
    // Подготовка общая для копий ссылки и синхронной отметки выхода; после clear каталог создаётся заново.
    private let lock = NSLock()
    private var prepared = false
    private struct Drafts: Codable, Equatable {
        let ownerID: String
        var questions: [String: [Int: QuestionReportDraft]] = [:]
    }
    private var cachedDrafts: Drafts?

    init(directory: URL) { self.directory = directory }

    static func live(beside cache: TodayCache = .live()) -> TrainingStore {
        TrainingStore(directory: cache.fileURL.deletingLastPathComponent().appending(path: "trainings"))
    }
    private var ownerURL: URL { directory.appending(path: "owner.json") }
    private var clearURL: URL { directory.appending(path: "clear-pending") }
    private var retiredURL: URL { directory.appendingPathExtension("clearing") }
    private var draftsURL: URL { directory.appending(path: "report-drafts.json") }
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
                    (training.reports ?? []).allSatisfy({
                        (0..<training.total).contains($0.position) && $0.body.trainingId == training.id
                    }),
                    (training.reportDrafts ?? [:]).keys.allSatisfy({ (0..<training.total).contains($0) }),
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
        try lock.withLock {
            try writeLocked(JSONEncoder().encode(Identity(ownerID: ownerID, credentialID: credentialID)), to: ownerURL)
            if cachedDrafts?.ownerID != ownerID { cachedDrafts = nil }
        }
    }

    func reportDraft(_ id: String, position: Int, ownerID: String) throws -> QuestionReportDraft? {
        try lock.withLock { try draftsLocked(ownerID: ownerID).questions[id]?[position] }
    }

    /// Ввод не ждёт actor или сети и не переписывает файлы с заданиями; копия меняется только после записи.
    func saveReportDraft(_ id: String, position: Int, draft: QuestionReportDraft?, ownerID: String) throws {
        guard UUID(uuidString: id) != nil, position >= 0 else { throw TrainingStorageError.invalidRecord }
        try lock.withLock {
            var value = try draftsLocked(ownerID: ownerID)
            let draft = draft.flatMap { $0.isEmpty ? nil : $0 }
            // Публикация actor может ещё ждать MainActor после уборки. Поздняя буква не создаёт сироту.
            if draft != nil, !FileManager.default.fileExists(atPath: file(id).path) {
                throw TrainingStorageError.missingTraining
            }
            value.questions[id, default: [:]][position] = draft
            if value.questions[id]?.isEmpty == true { value.questions[id] = nil }
            try saveDraftsLocked(value)
        }
    }

    /// Перенос старых черновиков и удаление ссылок на уже убранные или повреждённые тренировки.
    func reconcileReportDrafts(ownerID: String, trainings: [String: StoredTraining], report: (String) -> Void) throws {
        try lock.withLock {
            var value: Drafts
            do { value = try draftsLocked(ownerID: ownerID) } catch {
                report("question report drafts unreadable: \(Self.reason(error))")
                if FileManager.default.fileExists(atPath: draftsURL.path) {
                    try FileManager.default.moveItem(
                        at: draftsURL, to: draftsURL.appendingPathExtension("\(UUID().uuidString).broken"))
                }
                value = Drafts(ownerID: ownerID)
                cachedDrafts = value
            }
            for training in trainings.values where training.ownerID == ownerID {
                for (position, draft) in training.reportDrafts ?? [:] where !draft.isEmpty {
                    if value.questions[training.id]?[position] == nil {
                        value.questions[training.id, default: [:]][position] = draft
                    }
                }
            }
            value.questions = value.questions.compactMapValues { $0.filter { !$0.value.isEmpty } }
            for id in Array(value.questions.keys) {
                guard let training = trainings[id], training.ownerID == ownerID else {
                    value.questions[id] = nil
                    continue
                }
                value.questions[id] = value.questions[id]?.filter { (0..<training.total).contains($0.key) }
                if value.questions[id]?.isEmpty == true { value.questions[id] = nil }
            }
            try saveDraftsLocked(value)
        }
    }

    private func draftsLocked(ownerID: String) throws -> Drafts {
        if let cachedDrafts, cachedDrafts.ownerID == ownerID { return cachedDrafts }
        guard try owner() == ownerID, !requiresClear else { throw TrainingStorageError.invalidRecord }
        let value =
            try FileManager.default.fileExists(atPath: draftsURL.path)
            ? JSONDecoder().decode(Drafts.self, from: Data(contentsOf: draftsURL)) : Drafts(ownerID: ownerID)
        guard value.ownerID == ownerID else { throw TrainingStorageError.invalidRecord }
        cachedDrafts = value
        return value
    }

    private func saveDraftsLocked(_ value: Drafts) throws {
        guard cachedDrafts != value else { return }
        if value.questions.isEmpty {
            try removeIfPresent(draftsURL)
        } else {
            try writeLocked(JSONEncoder().encode(value), to: draftsURL)
        }
        cachedDrafts = value
    }

    func remove(_ id: String) throws {
        guard UUID(uuidString: id) != nil else { throw TrainingStorageError.invalidRecord }
        try removeIfPresent(file(id))
    }

    func clear() throws {
        try lock.withLock {
            cachedDrafts = nil
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
        try lock.withLock { try writeLocked(data, to: url) }
    }

    private func writeLocked(_ data: Data, to url: URL) throws {
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

    private func removeIfPresent(_ url: URL) throws {
        do { try FileManager.default.removeItem(at: url) } catch CocoaError.fileNoSuchFile { return }
    }

    static func reason(_ error: any Error) -> String {
        let failure = error as NSError
        return "\(failure.domain) \(failure.code)"
    }
}

enum TrainingStorageError: Error, Equatable { case invalidRecord, missingTraining }

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
