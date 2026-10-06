package dev.greprepapp.api.apis

import dev.greprepapp.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import dev.greprepapp.api.models.Error
import dev.greprepapp.api.models.ReviewQueue

interface AdminApi {
    /**
     * GET api/admin/review-queue
     * Очередь контента на проверку Даши (админка)
     * Только роль admin; остальным — 403 forbidden.
     * Responses:
     *  - 200: Очередь; в каркасе пустая
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @return [ReviewQueue]
     */
    @GET("api/admin/review-queue")
    suspend fun getReviewQueue(): Response<ReviewQueue>

}
