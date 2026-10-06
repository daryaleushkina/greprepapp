package dev.greprepapp.api.apis

import dev.greprepapp.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import dev.greprepapp.api.models.Error
import dev.greprepapp.api.models.User

interface AccountApi {
    /**
     * GET api/me
     * Кто вошёл
     * 
     * Responses:
     *  - 200: Пользователь
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @return [User]
     */
    @GET("api/me")
    suspend fun getMe(): Response<User>

}
