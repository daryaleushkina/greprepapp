import Foundation
import GPAPI

/// Чем закончился неудачный запрос — в тех словах, в которых экран решает, что показать.
/// Текст для человека выбирается по случаю, а не по `message` сервера (docs/HANDOFF.md, «Договор API»).
enum APIFailure: Error, Equatable, Sendable {
    /// Нет сети или сервер недоступен: показать прошлые данные и строку «Нет сети».
    case offline
    /// Сессии больше нет (истекла, вышли на другом устройстве): вернуться на экран входа.
    case unauthorized
    /// Сервер ответил ошибкой договора: код — для выбора текста, id запроса — для журнала.
    case server(status: Int, code: String, requestID: String?)
    /// Ответ не по договору или сбой на устройстве: в журнал client_errors.
    case unexpected(String)
    /// Запрос отменён (экран ушёл) — не ошибка, показывать нечего.
    case cancelled

    /// Ошибки, о которых стоит сообщить на сервер: отказ сети и отмена — не наши баги.
    var isReportable: Bool {
        switch self {
        case .offline, .unauthorized, .cancelled: false
        case let .server(status, _, _): status >= 500
        case .unexpected: true
        }
    }

    var requestID: String? {
        if case let .server(_, _, id) = self { return id }
        return nil
    }

    /// Разбор брошенной ошибки: транспорт, отмена, разбор ответа.
    init(_ error: any Error) {
        if let failure = error as? APIFailure {
            self = failure
            return
        }
        if error is CancellationError {
            self = .cancelled
            return
        }
        let underlying = GPAPIClient.underlyingError(error)
        // Описание ошибки генератора может содержать тело запроса или ответа. В журнал — только тип и код.
        let diagnostic = "\(String(reflecting: type(of: underlying))) \((underlying as NSError).code)"
        if underlying is CancellationError {
            self = .cancelled
            return
        }
        if let url = underlying as? URLError {
            if url.code == .cancelled {
                self = .cancelled
            } else if Self.offlineCodes.contains(url.code) {
                self = .offline
            } else {
                self = .unexpected("URLError \(url.code.rawValue)")
            }
            return
        }
        if let response = GPAPIClient.responseInfo(error) {
            // Ответил не наш сервер, а прокси перед ним (выкладка, сервер лёг): это «сервер недоступен», а не ошибка
            // приложения — тот же экран, что без сети, и повтор, когда он вернётся.
            if Self.proxyUnavailable.contains(response.status) {
                self = .offline
            } else {
                self = .unexpected("HTTP \(response.status) req=\(response.requestID ?? "-"): \(diagnostic)")
            }
            return
        }
        self = .unexpected(diagnostic)
    }

    /// Ответ-ошибка сервера: 401 — сессии нет; остальное — по коду договора. Имя — не `server`: функция с
    /// именем случая молча проигрывала ему при вызове, и 401 становился обычной ошибкой.
    static func response(status: Int, code: String?, requestID: String?) -> APIFailure {
        if status == 401 || code == "unauthorized" {
            return .unauthorized
        }
        return .server(status: status, code: code ?? "http_\(status)", requestID: requestID)
    }

    /// Статусы прокси (Caddy) перед сервером, когда сервер недоступен.
    private static let proxyUnavailable: Set<Int> = [502, 503, 504]

    /// Когда отвечать «нет сети». Обрыв на середине ответа — тоже сюда: 200 с оборванным телом — это сбой
    /// сети, а не пустой успех (docs/HANDOFF.md, «Клиент»).
    private static let offlineCodes: Set<URLError.Code> = [
        .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost,
        .dnsLookupFailed, .timedOut, .dataNotAllowed, .internationalRoamingOff, .callIsActive,
        .secureConnectionFailed, .cannotLoadFromNetwork,
        // Сертификат не тот: подмена соединения по дороге (в России бывает) — для человека сервер недоступен.
        .serverCertificateUntrusted, .serverCertificateHasBadDate, .serverCertificateHasUnknownRoot,
        .serverCertificateNotYetValid,
    ]
}
