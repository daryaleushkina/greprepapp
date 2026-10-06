package dev.greprepapp.api.apis

import dev.greprepapp.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import dev.greprepapp.api.models.AuthorizationCodeSignIn
import dev.greprepapp.api.models.DevSignIn
import dev.greprepapp.api.models.Error
import dev.greprepapp.api.models.IdTokenSignIn
import dev.greprepapp.api.models.Session
import dev.greprepapp.api.models.TelegramMiniAppSignIn

interface AuthApi {
    /**
     * POST api/auth/dev
     * Вход подменой — локально, в тестах и на стенде; в бою 404
     * Включается переменной DEV_AUTH&#x3D;1, которую сервер отказывается принять вместе с APP_ENV&#x3D;production (проверено тестом). Тем же путём e2e заводит своего пользователя на каждый тест.
     * Responses:
     *  - 200: Вошёл
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @param devSignIn 
     * @return [Session]
     */
    @POST("api/auth/dev")
    suspend fun signInForDevelopment(@Body devSignIn: DevSignIn): Response<Session>

    /**
     * POST api/auth/oidc/code
     * Вход по коду авторизации (Telegram везде, Apple на сайте и Android)
     * Код обменивается на id_token на сервере: для обмена нужен секрет клиента, на устройство он не попадает. PKCE — обязательно.
     * Responses:
     *  - 200: Вошёл
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @param authorizationCodeSignIn 
     * @return [Session]
     */
    @POST("api/auth/oidc/code")
    suspend fun signInWithAuthorizationCode(@Body authorizationCodeSignIn: AuthorizationCodeSignIn): Response<Session>

    /**
     * POST api/auth/oidc
     * Вход по id_token Apple или Google, полученному на устройстве
     * Родная кнопка Apple и Credential Manager Google отдают id_token прямо на устройстве. Сервер проверяет подпись по ключам компании, издателя, получателя, срок и nonce.
     * Responses:
     *  - 200: Вошёл
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @param idTokenSignIn 
     * @return [Session]
     */
    @POST("api/auth/oidc")
    suspend fun signInWithIdToken(@Body idTokenSignIn: IdTokenSignIn): Response<Session>

    /**
     * POST api/auth/telegram-mini-app
     * Вход из мини-аппа по initData (подпись проверяется ключом бота)
     * 
     * Responses:
     *  - 200: Вошёл; токен — в теле (мини-апп хранит его в памяти)
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @param telegramMiniAppSignIn 
     * @return [Session]
     */
    @POST("api/auth/telegram-mini-app")
    suspend fun signInWithTelegramMiniApp(@Body telegramMiniAppSignIn: TelegramMiniAppSignIn): Response<Session>

    /**
     * POST api/auth/logout
     * Выйти на этом устройстве — сессия удаляется сразу
     * 
     * Responses:
     *  - 204: Сессии больше нет; на сайте кука стёрта
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @return [Unit]
     */
    @POST("api/auth/logout")
    suspend fun signOut(): Response<Unit>

}
