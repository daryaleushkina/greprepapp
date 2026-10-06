package dev.greprepapp.api.apis

import dev.greprepapp.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import dev.greprepapp.api.models.Error
import dev.greprepapp.api.models.Today

interface TodayApi {
    /**
     * GET api/today
     * Лента шагов на сегодня (экран «Сегодня»)
     * 
     * Responses:
     *  - 200: Шаги по порядку; конец ленты виден
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @return [Today]
     */
    @GET("api/today")
    suspend fun getToday(): Response<Today>

}
