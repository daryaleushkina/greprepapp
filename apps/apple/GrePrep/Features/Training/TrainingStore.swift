import CryptoKit
import Foundation

/// По файлу на тренировку и маленький файл черновиков. Отдельные замки не задерживают ввод большой записью.
final class TrainingStore: @unchecked Sendable {
    let directory: URL
    // Подготовка общая для копий ссылки и синхронной отметки выхода; после clear каталог создаётся заново.
    private let lock = NSLock()
    private let draftsLock = NSLock()
    private var prepared = false
    private struct Drafts: Codable, Equatable {
        let ownerID: String
        var questions: [String: [Int: QuestionReportDraft]] = [:]
        var versions: [String: [Int: UUID]]?
        mutating func set(_ id: String, _ position: Int, _ draft: QuestionReportDraft?) {
            questions[id, default: [:]][position] = draft
            if questions[id]?.isEmpty == true { questions[id] = nil }
            var versions = self.versions ?? [:]
            versions[id, default: [:]][position] = draft == nil ? nil : UUID()
            if versions[id]?.isEmpty == true { versions[id] = nil }
            self.versions = versions.isEmpty ? nil : versions
        }
    }
    private var cachedDrafts: Drafts?
    private var persistedDrafts: Drafts?
    private let onDraftWrite: @Sendable () -> Void
    private let onTrainingWrite: @Sendable () -> Void

    init(
        directory: URL, onDraftWrite: @escaping @Sendable () -> Void = {},
        onTrainingWrite: @escaping @Sendable () -> Void = {}
    ) {
        self.directory = directory
        self.onDraftWrite = onDraftWrite
        self.onTrainingWrite = onTrainingWrite
    }

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
        try draftsLock.withLock {
            cachedDrafts = nil
            persistedDrafts = nil
            guard FileManager.default.fileExists(atPath: directory.path) else { return }
            try writeFile(Data(), to: clearURL)
        }
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
            try draftsLock.withLock {
                try writeLocked(
                    JSONEncoder().encode(Identity(ownerID: ownerID, credentialID: credentialID)), to: ownerURL)
                if cachedDrafts?.ownerID != ownerID {
                    cachedDrafts = nil
                    persistedDrafts = nil
                }
            }
        }
    }

    func reportDraft(_ id: String, position: Int, ownerID: String, consumed: UUID? = nil) throws -> QuestionReportDraft?
    {
        try draftsLock.withLock {
            let value = try draftsLocked(ownerID: ownerID)
            if let consumed, value.versions?[id]?[position] == consumed { return nil }
            return value.questions[id]?[position]
        }
    }

    /// Ввод не ждёт actor или сети и не переписывает файлы с заданиями; копия меняется только после записи.
    func saveReportDraft(_ id: String, position: Int, draft: QuestionReportDraft?, ownerID: String) throws {
        guard UUID(uuidString: id) != nil, position >= 0 else { throw TrainingStorageError.invalidRecord }
        try draftsLock.withLock {
            var value = try draftsLocked(ownerID: ownerID)
            let draft = draft.flatMap { $0.isEmpty ? nil : $0 }
            // Публикация actor может ещё ждать MainActor после уборки. Поздняя буква не создаёт сироту.
            if draft != nil, !FileManager.default.fileExists(atPath: file(id).path) {
                throw TrainingStorageError.missingTraining
            }
            if value.questions[id]?[position] == draft { return }
            value.set(id, position, draft)
            try saveDraftsLocked(value)
        }
    }

    /// Один атомарный файл принимает жалобу и отзывает именно её версию черновика, включая холодный запуск.
    func saveReport(_ training: StoredTraining, position: Int, report: (String) -> Void) throws -> StoredTraining {
        try lock.withLock {
            let consumed = try draftsLock.withLock {
                try draftsLocked(ownerID: training.ownerID).versions?[training.id]?[position]
            }
            var committed = training
            if let consumed {
                var clearances = committed.reportDraftClearances ?? [:]
                clearances[position] = consumed
                committed.reportDraftClearances = clearances
            }
            // Большой файл пишется без замка черновиков: другой вопрос может в это время сохранять ввод.
            try writeLocked(JSONEncoder().encode(committed), to: file(committed.id))
            try draftsLock.withLock {
                var value = try draftsLocked(ownerID: training.ownerID)
                // Новый ввод в другом окне после принятой версии не удаляется вместе со старым.
                if value.versions?[training.id]?[position] == consumed {
                    value.set(training.id, position, nil)
                    cachedDrafts = value
                    do { try saveDraftsLocked(value) } catch { report(Self.reason(error)) }
                }
            }
            return committed
        }
    }

    /// Перенос старых черновиков и удаление ссылок на уже убранные или повреждённые тренировки.
    func reconcileReportDrafts(ownerID: String, trainings: [String: StoredTraining], report: (String) -> Void) throws {
        try draftsLock.withLock {
            guard try owner() == ownerID, !requiresClear else { throw TrainingStorageError.invalidRecord }
            var value: Drafts
            do { value = try draftsLocked(ownerID: ownerID) } catch is DecodingError {
                report("question report drafts unreadable: invalid JSON")
                if FileManager.default.fileExists(atPath: draftsURL.path) {
                    try FileManager.default.moveItem(
                        at: draftsURL, to: draftsURL.appendingPathExtension("\(UUID().uuidString).broken"))
                }
                value = Drafts(ownerID: ownerID)
                cachedDrafts = value
                persistedDrafts = nil
            }
            for training in trainings.values where training.ownerID == ownerID {
                for (position, draft) in training.reportDrafts ?? [:] where !draft.isEmpty {
                    if value.questions[training.id]?[position] == nil {
                        value.set(training.id, position, draft)
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
                for position in Array(value.questions[id]?.keys ?? [Int: QuestionReportDraft]().keys) {
                    if let consumed = training.reportDraftClearances?[position],
                        value.versions?[id]?[position] == consumed
                    {
                        value.set(id, position, nil)
                    } else if value.versions?[id]?[position] == nil, let draft = value.questions[id]?[position] {
                        value.set(id, position, draft)
                    }
                }
            }
            value.versions = value.versions?.filter { value.questions[$0.key] != nil }
            cachedDrafts = value
            try saveDraftsLocked(value)
        }
    }

    private func draftsLocked(ownerID: String) throws -> Drafts {
        guard try owner() == ownerID, !requiresClear else { throw TrainingStorageError.invalidRecord }
        if let cachedDrafts, cachedDrafts.ownerID == ownerID { return cachedDrafts }
        let value =
            try FileManager.default.fileExists(atPath: draftsURL.path)
            ? JSONDecoder().decode(Drafts.self, from: Data(contentsOf: draftsURL)) : Drafts(ownerID: ownerID)
        guard value.ownerID == ownerID else { throw TrainingStorageError.invalidRecord }
        cachedDrafts = value
        persistedDrafts = value
        return value
    }

    private func saveDraftsLocked(_ value: Drafts) throws {
        guard persistedDrafts != value else { return }
        if value.questions.isEmpty {
            try removeIfPresent(draftsURL)
        } else {
            // Владелец уже проверен: каталог подготовлен при его записи, общий замок здесь не нужен.
            try writeFile(JSONEncoder().encode(value), to: draftsURL)
        }
        cachedDrafts = value
        persistedDrafts = value
        onDraftWrite()
    }

    func remove(_ id: String) throws {
        guard UUID(uuidString: id) != nil else { throw TrainingStorageError.invalidRecord }
        try removeIfPresent(file(id))
    }

    func clear() throws {
        try lock.withLock {
            try draftsLock.withLock {
                cachedDrafts = nil
                persistedDrafts = nil
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
    }

    private func file(_ id: String) -> URL { directory.appending(path: id + ".training.json") }

    private func write(_ data: Data, to url: URL) throws {
        try lock.withLock { try writeLocked(data, to: url) }
    }

    private func writeLocked(_ data: Data, to url: URL) throws {
        if url.lastPathComponent.hasSuffix(".training.json") { onTrainingWrite() }
        if !prepared {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            var folder = directory
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try folder.setResourceValues(values)
            prepared = true
        }
        try writeFile(data, to: url)
    }

    private func writeFile(_ data: Data, to url: URL) throws {
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
    private let draftsLock = NSLock()
    private let revisionLock = NSLock()
    private var revision = 0

    func renew() -> Int {
        lock.withLock {
            draftsLock.withLock {
                revisionLock.withLock {
                    revision += 1
                    return revision
                }
            }
        }
    }
    func isCurrent(_ value: Int) -> Bool { revisionLock.withLock { revision == value } }
    @discardableResult
    func withCurrent<T>(_ value: Int, _ action: () throws -> T) rethrows -> T? {
        try lock.withLock {
            guard isCurrent(value) else { return nil }
            return try action()
        }
    }
    /// Набор не ждёт записи тренировки. renew берёт оба замка в этом же порядке и отзывает обе операции.
    func withCurrentDraft<T>(_ value: Int, _ action: () throws -> T) rethrows -> T? {
        try draftsLock.withLock {
            guard isCurrent(value) else { return nil }
            return try action()
        }
    }
}
