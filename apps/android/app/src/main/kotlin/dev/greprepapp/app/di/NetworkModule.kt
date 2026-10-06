package dev.greprepapp.app.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dev.greprepapp.api.GrePrepApi
import dev.greprepapp.api.apiCallNoContent
import dev.greprepapp.api.apis.AuthApi
import dev.greprepapp.api.apis.PublicApi
import dev.greprepapp.api.apis.TodayApi
import dev.greprepapp.api.apis.TrainingsApi
import dev.greprepapp.app.core.AppConfig
import dev.greprepapp.app.core.session.ServerSignOut
import dev.greprepapp.app.core.session.TokenHolder
import okhttp3.OkHttpClient
import java.time.Duration
import javax.inject.Singleton

/** Сроки запросов: телефон в метро ждёт ответа не дольше, чем человек готов смотреть на крутилку. */
private val CONNECT_TIMEOUT: Duration = Duration.ofSeconds(10)
private val CALL_TIMEOUT: Duration = Duration.ofSeconds(30)

private const val AUTHORIZATION = "Authorization"

/**
 * Сеть: OkHttp, клиент договора и его части. Отдельно от AppModule, чтобы сценарные тесты подменяли
 * устройство (хранилища, сеть, адрес сервера), а запросы шли тем же кодом, что в бою.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    /** Без токена: на нём уходит «выйти» с явным заголовком и строятся остальные клиенты. */
    @Provides
    @Singleton
    fun baseClient(): OkHttpClient =
        OkHttpClient
            .Builder()
            .connectTimeout(CONNECT_TIMEOUT)
            .callTimeout(CALL_TIMEOUT)
            .build()

    @Provides
    @Singleton
    fun api(
        base: OkHttpClient,
        holder: TokenHolder,
        config: AppConfig,
    ): GrePrepApi {
        val client =
            base
                .newBuilder()
                .addInterceptor { chain ->
                    val request = chain.request()
                    val token = holder.token
                    if (token.isNullOrEmpty() || request.header(AUTHORIZATION) != null) {
                        chain.proceed(request)
                    } else {
                        chain.proceed(request.newBuilder().header(AUTHORIZATION, "Bearer $token").build())
                    }
                }.build()
        return GrePrepApi(config.apiBaseUrl, client)
    }

    // Экраны получают только свою часть договора — в тестах её легко подменить.
    @Provides
    fun todayApi(api: GrePrepApi): TodayApi = api.today

    @Provides
    fun authApi(api: GrePrepApi): AuthApi = api.auth

    @Provides
    fun publicApi(api: GrePrepApi): PublicApi = api.public

    @Provides
    fun trainingsApi(api: GrePrepApi): TrainingsApi = api.trainings

    @Provides
    @Singleton
    fun serverSignOut(
        base: OkHttpClient,
        config: AppConfig,
    ): ServerSignOut =
        ServerSignOut { token ->
            val api =
                GrePrepApi(
                    config.apiBaseUrl,
                    base
                        .newBuilder()
                        .addInterceptor { chain ->
                            chain.proceed(
                                chain
                                    .request()
                                    .newBuilder()
                                    .header(AUTHORIZATION, "Bearer $token")
                                    .build(),
                            )
                        }.build(),
                )
            // Необязательный фон: на устройстве человек уже вышел, сервер — уборка; не дошло — сессия истечёт.
            apiCallNoContent { api.auth.signOut() }
        }
}
