package dev.greprepapp.api

import dev.greprepapp.api.apis.AccountApi
import dev.greprepapp.api.apis.AuthApi
import dev.greprepapp.api.apis.PublicApi
import dev.greprepapp.api.apis.TodayApi
import dev.greprepapp.api.apis.TrainingsApi
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.converter.scalars.ScalarsConverterFactory
import retrofit2.create

/**
 * Разбор JSON договора. Ответ читается «терпимо»: незнакомое поле пропускается — сервер обновляется раньше
 * приложения, а установленные версии силой не обновить (то же у Apple, docs/HANDOFF.md). Известные поля
 * проверяются по типам: нет обязательного поля или тип не тот — ошибка разбора, а не тихий пустой экран.
 * Новое значение enum так не пропустить — задача #4; у тренировок договор обходит это сам: клиент называет
 * типы заданий, которые умеет показывать, а вид набора — открытая строка.
 */
val ApiJson: Json =
    Json {
        ignoreUnknownKeys = true
        // Необязательное поле без значения не отправляется: сервер (ogen) не принимает null вместо отсутствия.
        explicitNulls = false
        encodeDefaults = false
    }

/** Клиент договора поверх одного OkHttp: токен, срок и журнал добавляет тот, кто собирает client. */
class GrePrepApi(
    baseUrl: HttpUrl,
    client: OkHttpClient,
) {
    private val retrofit: Retrofit =
        Retrofit
            .Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(ScalarsConverterFactory.create())
            .addConverterFactory(ApiJson.asConverterFactory("application/json".toMediaType()))
            .build()

    val auth: AuthApi = retrofit.create()
    val account: AccountApi = retrofit.create()
    val today: TodayApi = retrofit.create()
    val public: PublicApi = retrofit.create()
    val trainings: TrainingsApi = retrofit.create()
}
