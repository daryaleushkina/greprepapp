import Foundation

/// Последний загруженный план «Сегодня» на устройстве: без сети экран показывает его со строкой «Нет сети»
/// (решение Даши 06.10.2026). В плане только названия шагов — платного в нём нет.
struct TodayCache: Sendable {
    let fileURL: URL

    static func live() -> TodayCache {
        // Своя папка по идентификатору приложения: вне песочницы (отладочная сборка для Mac) Application
        // Support — общая папка пользователя.
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let folder = Bundle.main.bundleIdentifier ?? "dev.greprepapp.app"
        return TodayCache(fileURL: base.appending(path: folder).appending(path: "today.json"))
    }

    /// Прошлый план. Испорченный файл (обновление формата, сбой записи) — не ошибка для человека: план
    /// просто загрузится заново, а файл удаляется.
    func load() -> TodayDTO? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        do {
            return try JSONDecoder().decode(TodayDTO.self, from: data)
        } catch {
            clear()
            return nil
        }
    }

    func save(_ today: TodayDTO) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(today)
        #if os(iOS)
            try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
            try data.write(to: fileURL, options: .atomic)
        #endif
    }

    /// Выход и чужой аккаунт: план прошлого человека не должен мелькнуть следующему.
    func clear() {
        // Необязательный фон: файла может не быть — это и есть цель.
        _ = try? FileManager.default.removeItem(at: fileURL)
    }
}
