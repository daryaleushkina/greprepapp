import Foundation
import Observation

/// Экран «Сегодня»: план с сервера, а без сети — прошлый план со строкой «Нет сети» (решение Даши 06.10.2026).
@MainActor
@Observable
final class TodayModel {
    enum Content: Equatable {
        case loading
        case plan(TodayPlan)
        /// Плана нет ни с сервера, ни на устройстве.
        case unavailable(Problem)
    }

    enum Problem: Equatable {
        case offline
        case failed
    }

    private(set) var content: Content = .loading
    /// На экране прошлый план: обновить не удалось. nil — план свежий.
    private(set) var staleReason: Problem?
    private(set) var isRefreshing = false

    @ObservationIgnored private let api: API
    @ObservationIgnored private let cache: TodayCache
    @ObservationIgnored private let onUnauthorized: @MainActor () -> Void
    @ObservationIgnored private let report: @MainActor (_ message: String, _ requestID: String?) -> Void
    /// Номер последнего запроса: ответы приходят не по порядку, и старый не должен затереть свежий
    /// (docs/HANDOFF.md, «Клиент»).
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var isRetired = false
    /// Когда план в последний раз пришёл с сервера.
    @ObservationIgnored private var fetchedAt: Date?
    static let freshFor: TimeInterval = 5 * 60

    init(
        api: API,
        cache: TodayCache,
        onUnauthorized: @escaping @MainActor () -> Void,
        report: @escaping @MainActor (_ message: String, _ requestID: String?) -> Void
    ) {
        self.api = api
        self.cache = cache
        self.onUnauthorized = onUnauthorized
        self.report = report
        // Прошлый план — сразу, до ответа сервера: экран не мигает пустотой при каждом открытии.
        if let cached = cache.load() {
            content = .plan(TodayPlan(cached))
        }
    }

    /// Нужен ли повтор, когда вернулась сеть.
    var needsRefresh: Bool {
        if staleReason != nil { return true }
        if case .unavailable = content { return true }
        return false
    }

    /// Возврат в приложение (и фокус окна на Mac) — частое событие: план перезапрашивается, только если он
    /// старше пяти минут или его обновить не удалось. План дня меняется после тренировки, а не каждую минуту.
    func refreshIfStale(now: Date = .now) async {
        if let fetchedAt, staleReason == nil, now.timeIntervalSince(fetchedAt) < Self.freshFor { return }
        await refresh(now: now)
    }

    /// Сеть вернулась — план, который не удалось обновить, обновляется сам (решение Даши 06.10.2026).
    func networkChanged(online: Bool) async {
        guard online, needsRefresh else { return }
        await refresh()
    }

    /// Человек вышел: модель больше ничего не запрашивает, а ответы, которые ещё в пути, отбрасываются — иначе
    /// поздний ответ вернул бы на устройство план вышедшего, а поздний 401 выкинул бы того, кто вошёл после.
    func retire() {
        isRetired = true
        generation += 1
        isRefreshing = false
    }

    func refresh() async {
        await refresh(now: .now)
    }

    private func refresh(now: Date) async {
        guard !isRetired else { return }
        generation += 1
        let mine = generation
        isRefreshing = true
        defer {
            if mine == generation { isRefreshing = false }
        }
        let result: Result<TodayDTO, APIFailure>
        do {
            result = .success(try await api.today())
        } catch {
            result = .failure(error)
        }
        guard mine == generation else { return }
        switch result {
        case let .success(dto):
            content = .plan(TodayPlan(dto))
            staleReason = nil
            fetchedAt = now
            do {
                try cache.save(dto)
            } catch {
                // Только домен и код: в тексте ошибки — путь к файлу, а на Mac в нём имя учётной записи.
                let error = error as NSError
                report("today cache write failed: \(error.domain) \(error.code)", nil)
            }
        case let .failure(failure):
            handle(failure)
        }
    }

    private func handle(_ failure: APIFailure) {
        switch failure {
        case .cancelled:
            // Экран ушёл посреди запроса — показывать нечего; вернётся — запросит заново.
            return
        case .unauthorized:
            onUnauthorized()
        case .offline:
            show(.offline)
        case .server, .unexpected:
            // Любой отказ сервера на план дня — наш баг (клиент и сервер разошлись), не только 5xx.
            report("today: \(failure)", failure.requestID)
            show(.failed)
        }
    }

    private func show(_ problem: Problem) {
        if case .plan = content {
            staleReason = problem
        } else {
            content = .unavailable(problem)
        }
    }
}
