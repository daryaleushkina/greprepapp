import Foundation
import Testing

@testable import GrePrep

/// Подменный сервер для тестов: свой адрес на каждый тест, ответы — по пути. Сеть не трогается: запросы
/// перехватывает URLProtocol, поэтому проверяется настоящий путь приложения — URLSession, клиент договора,
/// разбор ответа (как httptest у бэкенда).
final class StubServer: @unchecked Sendable {
    // @unchecked: всё изменяемое — под замком.
    struct Request: Sendable {
        let method: String
        let path: String
        let headers: [String: String]
        let body: Data
        var authorization: String? { headers.first { $0.key.lowercased() == "authorization" }?.value }
        func json() throws -> [String: Any] {
            try JSONSerialization.jsonObject(with: body) as? [String: Any] ?? [:]
        }
    }

    enum Reply: Sendable {
        case json(Int, String)
        case status(Int)
        case failure(URLError.Code)
        /// Ответ, который придёт, когда тест откроет ворота (проверка порядка ответов).
        case gated(Gate, Int, String)
    }

    /// Задержка ответа до сигнала из теста.
    final class Gate: @unchecked Sendable {
        private let semaphore = DispatchSemaphore(value: 0)
        func open() { semaphore.signal() }
        func wait() { semaphore.wait() }
    }

    let host = "stub-\(UUID().uuidString.lowercased()).test"
    var baseURL: URL { URL(string: "https://\(host)")! }
    private let lock = NSLock()
    private var routes: [String: [Reply]] = [:]
    private var log: [Request] = []

    init() {
        StubURLProtocol.register(self)
    }

    deinit {
        StubURLProtocol.unregister(host)
    }

    /// Ответы на «METHOD /path» по очереди; последний повторяется.
    func on(_ route: String, _ replies: Reply...) {
        lock.withLock { routes[route] = replies }
    }

    var requests: [Request] { lock.withLock { log } }

    func requests(_ route: String) -> [Request] {
        requests.filter { "\($0.method) \($0.path)" == route }
    }

    lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        configuration.timeoutIntervalForRequest = 5
        return URLSession(configuration: configuration)
    }()

    func config(webProviders: [WebProvider: WebProviderConfig] = [:], appleSignInEnabled: Bool = false) -> AppConfig {
        AppConfig(
            apiBaseURL: baseURL, clientKind: .ios, appVersion: "0.1.0 (1)", webProviders: webProviders,
            appleSignInEnabled: appleSignInEnabled)
    }

    fileprivate func reply(to request: Request) -> Reply {
        lock.withLock {
            log.append(request)
            let key = "\(request.method) \(request.path)"
            guard var queue = routes[key], !queue.isEmpty else {
                return .json(404, #"{"code":"not_found","message":"no stub for \#(key)","requestId":"stub"}"#)
            }
            let next = queue.removeFirst()
            if !queue.isEmpty { routes[key] = queue }
            return next
        }
    }
}

final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var servers: [String: StubServer] = [:]

    static func register(_ server: StubServer) {
        lock.withLock { servers[server.host] = server }
    }

    static func unregister(_ host: String) {
        lock.withLock { _ = servers.removeValue(forKey: host) }
    }

    private static func server(for host: String?) -> StubServer? {
        guard let host else { return nil }
        return lock.withLock { servers[host] }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, let server = Self.server(for: url.host()) else {
            client?.urlProtocol(self, didFailWithError: URLError(.cannotFindHost))
            return
        }
        let recorded = StubServer.Request(
            method: request.httpMethod ?? "GET",
            path: url.path(),
            headers: request.allHTTPHeaderFields ?? [:],
            body: request.httpBody ?? request.httpBodyStream.map(Self.read) ?? Data()
        )
        let reply = server.reply(to: recorded)
        let client = client
        let finish: @Sendable () -> Void = { [self] in
            switch reply {
            case let .failure(code):
                client?.urlProtocol(self, didFailWithError: URLError(code))
            case let .status(status):
                self.respond(client, url, status, Data())
            case let .json(status, body), let .gated(_, status, body):
                self.respond(client, url, status, Data(body.utf8))
            }
        }
        if case let .gated(gate, _, _) = reply {
            DispatchQueue.global().async {
                gate.wait()
                finish()
            }
        } else {
            finish()
        }
    }

    override func stopLoading() {}

    private func respond(_ client: (any URLProtocolClient)?, _ url: URL, _ status: Int, _ body: Data) {
        let response = HTTPURLResponse(
            url: url, statusCode: status, httpVersion: "HTTP/1.1",
            headerFields: body.isEmpty ? [:] : ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        if !body.isEmpty { client?.urlProtocol(self, didLoad: body) }
        client?.urlProtocolDidFinishLoading(self)
    }

    /// Тело запроса из потока: читать до конца (read → 0), а не пока «есть доступные байты» — у потока тела
    /// URLSession их может ещё не быть в первый момент, и тело выходило пустым.
    private static func read(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while true {
            let n = stream.read(&buffer, maxLength: buffer.count)
            if n <= 0 { break }
            data.append(buffer, count: n)
        }
        return data
    }
}

/// Ответы сервера, как в договоре.
enum Fixture {
    static let todayJSON = #"""
        {"date":"2026-10-06","steps":[
          {"id":"words","section":"words","title":"Слова: повторение","minutes":5,"state":"current"},
          {"id":"verbal","section":"verbal","title":"Verbal: Text Completion","minutes":10,"state":"next"},
          {"id":"quant","section":"quant","title":"Quant: Quantitative Comparison","minutes":10,"state":"next"}
        ]}
        """#

    static func session(token: String = "token-1", name: String = "Даша") -> String {
        #"""
        {"token":"\#(token)","expiresAt":"2026-11-05T00:00:00Z","user":{"id":"8f0c6c1e-5a43-4c1a-9b7e-0c4b1f2d3e4f","name":"\#(name)","role":"user","locale":"ru","identities":[]}}
        """#
    }

    static func error(_ code: String, requestID: String = "req-1") -> String {
        #"{"code":"\#(code)","message":"stub","requestId":"\#(requestID)"}"#
    }

    static var todayDTO: TodayDTO {
        try! JSONDecoder().decode(TodayDTO.self, from: Data(todayJSON.utf8))
    }

    static var plan: TodayPlan { TodayPlan(todayDTO) }

    static var user: UserDTO {
        try! JSONDecoder().decode(
            UserDTO.self,
            from: Data(
                #"{"id":"8f0c6c1e-5a43-4c1a-9b7e-0c4b1f2d3e4f","name":"x","role":"user","locale":"ru","identities":[]}"#
                    .utf8))
    }
}

/// Кэш плана во временной папке: у каждого теста свой файл.
func temporaryCache() -> TodayCache {
    // Пробел в пути — как в настоящей папке «Application Support».
    TodayCache(
        fileURL: FileManager.default.temporaryDirectory.appending(
            path: "Application Support \(UUID().uuidString)/today.json"))
}

/// Ожидающая проверка: условие становится верным само (фоновая задача, ответ сервера). Без пауз — уступает
/// очередь, пока не выйдет срок; не дождались — тест красный, а не зависший.
@MainActor
func eventually(
    timeout: Duration = .seconds(5),
    sourceLocation: SourceLocation = #_sourceLocation,
    _ condition: () -> Bool
) async {
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: timeout)
    while !condition() {
        if clock.now > deadline {
            Issue.record("условие не выполнилось за \(timeout)", sourceLocation: sourceLocation)
            return
        }
        await Task.yield()
    }
}
