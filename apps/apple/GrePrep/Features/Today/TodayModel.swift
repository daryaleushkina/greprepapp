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

    func refresh() async {
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
            do {
                try cache.save(dto)
            } catch {
                report("today cache write failed: \(error)", nil)
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
            if failure.isReportable {
                report("today: \(failure)", failure.requestID)
            }
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
