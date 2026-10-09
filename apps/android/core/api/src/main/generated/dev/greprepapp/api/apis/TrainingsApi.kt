package dev.greprepapp.api.apis

import dev.greprepapp.api.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import dev.greprepapp.api.models.AnswerBatch
import dev.greprepapp.api.models.Error
import dev.greprepapp.api.models.Exam
import dev.greprepapp.api.models.QuestionReport
import dev.greprepapp.api.models.QuestionType
import dev.greprepapp.api.models.TrainingFinish
import dev.greprepapp.api.models.TrainingOptions
import dev.greprepapp.api.models.TrainingRequest
import dev.greprepapp.api.models.TrainingSession
import dev.greprepapp.api.models.TrainingSummary

interface TrainingsApi {
    /**
     * POST api/trainings/{trainingId}/finish
     * Закончить тренировку — итог и что повторить (макет R15)
     * Повторный вызов возвращает тот же итог.
     * Responses:
     *  - 200: Итог
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @param trainingId 
     * @param trainingFinish 
     * @return [TrainingSummary]
     */
    @POST("api/trainings/{trainingId}/finish")
    suspend fun finishTraining(@Path("trainingId") trainingId: kotlin.String, @Body trainingFinish: TrainingFinish): Response<TrainingSummary>

    /**
     * GET api/trainings/{trainingId}
     * Своя тренировка — продолжить с того же вопроса или посмотреть разбор
     * Чужая или несуществующая — 404 not_found, не 403, чтобы id чужих сессий не подтверждались.
     * Responses:
     *  - 200: Сессия с ответами, которые уже дошли до сервера
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @param trainingId 
     * @return [TrainingSession]
     */
    @GET("api/trainings/{trainingId}")
    suspend fun getTraining(@Path("trainingId") trainingId: kotlin.String): Response<TrainingSession>

    /**
     * GET api/trainings/options
     * Что можно собрать в конструкторе тренировки (макеты R1, R2)
     * Типы заданий с темами и числом доступных заданий (пустую выборку не собрать), готовые наборы и прошлая тренировка — чтобы «Начать» было видно сразу. Только проверенные задания.
     * Responses:
     *  - 200: Варианты конструктора
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @param exam 
     * @param types Типы заданий, которые клиент умеет показывать. Других сервер не присылает ни в списке, ни в наборах: новый тип на сервере не ломает уже установленные версии приложений.
     * @return [TrainingOptions]
     */
    @GET("api/trainings/options")
    suspend fun getTrainingOptions(@Query("exam") exam: Exam, @Query("types") types: @JvmSuppressWildcards kotlin.collections.List<QuestionType>): Response<TrainingOptions>

    /**
     * POST api/questions/{questionId}/reports
     * «Сообщить об ошибке» в задании — в очередь админки
     * 
     * Responses:
     *  - 204: Принято
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @param questionId 
     * @param questionReport 
     * @return [Unit]
     */
    @POST("api/questions/{questionId}/reports")
    suspend fun reportQuestion(@Path("questionId") questionId: kotlin.String, @Body questionReport: QuestionReport): Response<Unit>

    /**
     * POST api/trainings
     * Начать тренировку — сессия со всеми заданиями и разборами сразу
     * Всё нужное для сессии приходит одним ответом, чтобы начатая тренировка дожила без сети (PRODUCT.md, «Operating Context»). Задания — только проверенные, сначала те, что человек ещё не решал. Нет ни одного подходящего — 409 no_questions. Нет доступа к тренировкам — 403 forbidden.
     * Responses:
     *  - 201: Сессия создана
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @param trainingRequest 
     * @return [TrainingSession]
     */
    @POST("api/trainings")
    suspend fun startTraining(@Body trainingRequest: TrainingRequest): Response<TrainingSession>

    /**
     * POST api/trainings/{trainingId}/answers
     * Ответы, накопленные на устройстве (в том числе без сети)
     * Повторная отправка безопасна: ответ на позицию заменяется, а не дублируется. В «Практике» остаётся первый ответ (разбор уже показан), в «Проверке» — самый поздний по answeredAt (очередь без сети может прийти не по порядку). Сервер сам проверяет ответ по ключу — клиенту для статистики не верит. После завершения сессии ответы не принимаются (409 training_finished).
     * Responses:
     *  - 204: Записано
     *  - 0: Любая ошибка — машинный код, текст для журнала, id запроса
     *
     * @param trainingId 
     * @param answerBatch 
     * @return [Unit]
     */
    @POST("api/trainings/{trainingId}/answers")
    suspend fun submitTrainingAnswers(@Path("trainingId") trainingId: kotlin.String, @Body answerBatch: AnswerBatch): Response<Unit>

}
