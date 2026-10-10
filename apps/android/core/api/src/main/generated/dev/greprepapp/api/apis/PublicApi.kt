package dev.greprepapp.api.apis

import dev.greprepapp.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import dev.greprepapp.api.models.ClientError
import dev.greprepapp.api.models.Error
import dev.greprepapp.api.models.ExamList
import dev.greprepapp.api.models.Health

interface PublicApi {
    /**
     * GET api/exams
     * Экзамены и разделы в порядке прохождения
     * 
     * Responses:
     *  - 200: Доступные экзамены
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @return [ExamList]
     */
    @GET("api/exams")
    suspend fun getExams(): Response<ExamList>

    /**
     * GET api/health
     * Жив ли сервер и какая сборка (сверка после выкладки)
     * 
     * Responses:
     *  - 200: Сервер отвечает, база доступна
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @return [Health]
     */
    @GET("api/health")
    suspend fun getHealth(): Response<Health>

    /**
     * POST api/client-errors
     * Ошибка на клиенте — в таблицу client_errors
     * Можно без входа (ошибка до входа тоже важна). Размер тела и частота ограничены на сервере.
     * Responses:
     *  - 204: Записано
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @param clientError 
     * @return [Unit]
     */
    @POST("api/client-errors")
    suspend fun reportClientError(@Body clientError: ClientError): Response<Unit>

}
