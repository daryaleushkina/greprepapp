import Foundation
import Network

/// Есть ли у устройства путь в сеть. Это не обещание, что сервер ответит (из России его могут резать), а
/// повод попробовать снова: вернулась сеть — экран перезапрашивает данные сам.
@MainActor
@Observable
final class NetworkMonitor {
    private(set) var isOnline: Bool
    @ObservationIgnored private var monitor: NWPathMonitor?

    init(isOnline: Bool = true) {
        self.isOnline = isOnline
    }

    /// Живой монитор. В тестах не создаётся: состояние сети задаётся руками.
    static func live() -> NetworkMonitor {
        let network = NetworkMonitor()
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak network] path in
            let online = path.status == .satisfied
            Task { @MainActor in network?.set(online: online) }
        }
        monitor.start(queue: DispatchQueue(label: "dev.greprepapp.network"))
        network.monitor = monitor
        return network
    }

    func set(online: Bool) {
        if isOnline != online {
            isOnline = online
        }
    }

    isolated deinit {
        monitor?.cancel()
    }
}
