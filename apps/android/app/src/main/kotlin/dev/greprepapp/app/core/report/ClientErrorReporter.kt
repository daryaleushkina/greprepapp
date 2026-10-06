package dev.greprepapp.app.core.report

import android.util.Log
import dev.greprepapp.api.apiCallNoContent
import dev.greprepapp.api.apis.PublicApi
import dev.greprepapp.api.models.ClientError
import dev.greprepapp.app.core.AppConfig
import dev.greprepapp.app.core.AppScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.time.Clock
import java.time.Instant
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton

/** Пределы полей ClientError из договора: сервер считает символы (code points), а не UTF-16. */
private const val MESSAGE_MAX = 2000
private const val ROUTE_MAX = 512
private const val REQUEST_ID_MAX = 64

/** Сообщить об ошибке на устройстве — в таблицу client_errors, не задерживая экран. */
@Singleton
class ClientErrorReporter
    @Inject
    constructor(
        // Provider: клиент API собирается из OkHttp, а отчёт может понадобиться ещё до него (чтение входа).
        private val api: Provider<PublicApi>,
        private val config: AppConfig,
        private val clock: Clock,
        @param:AppScope private val scope: CoroutineScope,
    ) {
        fun report(
            message: String,
            route: String,
            requestId: String? = null,
        ) {
            Log.w(TAG, "$route: $message")
            val body =
                ClientError(
                    message = message.takeCodePoints(MESSAGE_MAX),
                    clientKind = config.clientKind,
                    appVersion = config.appVersion,
                    occurredAt = Instant.now(clock).toString(),
                    route = route.takeCodePoints(ROUTE_MAX),
                    requestId = requestId?.takeCodePoints(REQUEST_ID_MAX),
                )
            scope.launch {
                // Необязательный фон: не дошёл отчёт (нет сети) — экран от этого не меняется.
                apiCallNoContent { api.get().reportClientError(body) }
            }
        }

        private companion object {
            const val TAG = "GrePrep"
        }
    }

/** Обрезать по символам Unicode, не разрезая суррогатную пару. */
internal fun String.takeCodePoints(max: Int): String {
    if (codePointCount(0, length) <= max) return this
    return substring(0, offsetByCodePoints(0, max))
}
