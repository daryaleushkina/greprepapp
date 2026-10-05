import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession

/// Сборка клиента договора для приложения. Сеть — через переданный URLSession: в приложении — свой
/// (сроки, без кук и кэша), в тестах — с подменным URLProtocol.
public enum GPAPIClient {
    public static func make(
        baseURL: URL,
        session: URLSession,
        token: @escaping @Sendable () -> String?
    ) -> Client {
        Client(
            serverURL: baseURL,
            transport: URLSessionTransport(configuration: .init(session: session)),
            middlewares: [BearerToken(token: token)]
        )
    }

    /// Ошибка без обёртки генератора: транспорт (URLError), отмена, разбор ответа.
    public static func underlyingError(_ error: any Error) -> any Error {
        (error as? ClientError)?.underlyingError ?? error
    }
}

/// Токен сессии в заголовке Authorization. Генератор Apple не читает securitySchemes договора, поэтому
/// заголовок ставит эта прослойка (api/openapi.yaml, шапка).
struct BearerToken: ClientMiddleware {
    let token: @Sendable () -> String?

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        if let token = token(), !token.isEmpty {
            request.headerFields[.authorization] = "Bearer \(token)"
        }
        return try await next(request, body, baseURL)
    }
}
