package dev.greprepapp.api

import dev.greprepapp.api.models.Error
import kotlinx.serialization.SerializationException
import retrofit2.Response
import java.io.IOException
import kotlin.coroutines.cancellation.CancellationException

/**
 * Чем закончился неудачный запрос — в тех словах, в которых экран решает, что показать. Текст для человека
 * выбирается по случаю, а не по `message` сервера (docs/HANDOFF.md, «Договор API»). Те же случаи, что у
 * приложения Apple (APIFailure).
 */
sealed interface ApiFailure {
    /** Нет сети или сервер недоступен: показать прошлые данные и строку «Нет сети». */
    data object Offline : ApiFailure

    /** Сессии больше нет (истекла, вышли на другом устройстве): вернуться на экран входа. */
    data object Unauthorized : ApiFailure

    /** Сервер ответил ошибкой договора: код — для выбора текста, id запроса — для журнала. */
    data class Server(
        val status: Int,
        val code: String,
        val requestId: String?,
    ) : ApiFailure

    /** Ответ не по договору или сбой на устройстве: в журнал client_errors. */
    data class Unexpected(
        val detail: String,
        val requestId: String? = null,
    ) : ApiFailure

    /** Об этих стоит сообщить на сервер: нет сети и конец сессии — не наши баги. */
    val isReportable: Boolean
        get() =
            when (this) {
                Offline, Unauthorized -> false
                is Server -> status >= 500
                is Unexpected -> true
            }

    val requestIdOrNull: String?
        get() =
            when (this) {
                is Server -> requestId
                is Unexpected -> requestId
                else -> null
            }
}

/** Итог запроса: значение или причина отказа. Отмена корутины — не итог, она летит дальше. */
sealed interface ApiResult<out T> {
    data class Ok<T>(
        val value: T,
    ) : ApiResult<T>

    data class Failed(
        val failure: ApiFailure,
    ) : ApiResult<Nothing>
}

/** Статусы прокси (Caddy) перед сервером, когда сервер недоступен: для человека это «нет сети». */
private val proxyUnavailable = setOf(502, 503, 504)

private const val REQUEST_ID_HEADER = "X-Request-Id"

/**
 * Выполнить запрос договора. Ответ 2xx без тела у операции с телом — ошибка договора, а не пустой успех;
 * обрыв посреди ответа — IOException, то есть «нет сети» (docs/HANDOFF.md, «Клиент»).
 */
suspend fun <T : Any> apiCall(request: suspend () -> Response<T>): ApiResult<T> =
    apiCallInternal(request) { response ->
        val body = response.body()
        if (body == null) {
            ApiResult.Failed(
                ApiFailure.Unexpected("HTTP ${response.code()} without body", response.headers()[REQUEST_ID_HEADER]),
            )
        } else {
            ApiResult.Ok(body)
        }
    }

/** Для операций без тела ответа (204). */
suspend fun apiCallNoContent(request: suspend () -> Response<Unit>): ApiResult<Unit> = apiCallInternal(request) { ApiResult.Ok(Unit) }

private suspend fun <T : Any, R> apiCallInternal(
    request: suspend () -> Response<T>,
    onSuccess: (Response<T>) -> ApiResult<R>,
): ApiResult<R> {
    val response =
        try {
            request()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: IOException) {
            // Транспорт: нет сети, сервер не отвечает, сертификат не тот (подмена соединения по дороге —
            // в России бывает), ответ оборвался. Для человека всё это — «сервер недоступен».
            return ApiResult.Failed(ApiFailure.Offline)
        } catch (bad: SerializationException) {
            return ApiResult.Failed(ApiFailure.Unexpected("decode: ${bad.message}"))
        } catch (bad: IllegalArgumentException) {
            // Разбор ответа kotlinx бросает и IllegalArgumentException (например, неизвестное значение enum).
            return ApiResult.Failed(ApiFailure.Unexpected("decode: ${bad.message}"))
        }
    if (response.isSuccessful) return onSuccess(response)
    return ApiResult.Failed(failureOf(response))
}

/** Ответ-ошибка: 401 — сессии нет; 502–504 — прокси без сервера; остальное — по коду договора. */
fun failureOf(response: Response<*>): ApiFailure {
    val status = response.code()
    if (status in proxyUnavailable) return ApiFailure.Offline
    val error = decodeError(response)
    val requestId = error?.requestId ?: response.headers()[REQUEST_ID_HEADER]
    if (status == 401 || error?.code == "unauthorized") return ApiFailure.Unauthorized
    return ApiFailure.Server(status = status, code = error?.code ?: "http_$status", requestId = requestId)
}

private fun decodeError(response: Response<*>): Error? {
    val raw =
        try {
            response.errorBody()?.string()
        } catch (_: IOException) {
            // Тело ошибки оборвалось — код и статус всё равно есть, id запроса возьмём из заголовка.
            null
        } ?: return null
    return try {
        ApiJson.decodeFromString(Error.serializer(), raw)
    } catch (_: SerializationException) {
        // Не наш формат (страница прокси, обрезанный ответ): статус всё объяснит.
        null
    } catch (_: IllegalArgumentException) {
        null
    }
}
