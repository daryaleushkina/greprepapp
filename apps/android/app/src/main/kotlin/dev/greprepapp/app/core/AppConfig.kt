package dev.greprepapp.app.core

import dev.greprepapp.api.models.ClientKind
import okhttp3.HttpUrl

/** Настройки сборки: адрес сервера (BuildConfig по типу сборки) и версия для журнала ошибок. */
data class AppConfig(
    val apiBaseUrl: HttpUrl,
    val appVersion: String,
    /** Вход подменой (`/api/auth/dev`) — только в отладочной сборке; в бою сервер отвечает на этот путь 404. */
    val devSignInAvailable: Boolean,
) {
    val clientKind: ClientKind = ClientKind.ANDROID
}
