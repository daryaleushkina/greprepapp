package dev.greprepapp.app.flow

import dev.greprepapp.api.ApiJson
import dev.greprepapp.api.models.AnswerBatch
import dev.greprepapp.api.models.DevSignIn
import dev.greprepapp.api.models.QuestionReport
import dev.greprepapp.api.models.Session
import dev.greprepapp.api.models.Today
import dev.greprepapp.api.models.TrainingFinish
import dev.greprepapp.api.models.TrainingOptions
import dev.greprepapp.api.models.TrainingRequest
import dev.greprepapp.api.models.TrainingSession
import dev.greprepapp.api.models.TrainingSummary
import dev.greprepapp.app.testing.Fixtures
import dev.greprepapp.app.testing.session
import dev.greprepapp.app.testing.starterPlan
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger

/**
 * Подменный сервер для сценариев через интерфейс: ведёт себя как сервер Go по договору — вход подменой
 * выдаёт токен, «Сегодня» без действующего токена отвечает 401, выход гасит токен. Можно «уронить» сеть
 * (прокси отвечает 503 — для приложения это «нет сети»).
 */
class FakeServer {
    private val server = MockWebServer()
    private val issued = AtomicInteger()
    private val valid = CopyOnWriteArrayList<String>()

    val signedOutTokens = CopyOnWriteArrayList<String>()
    val clientErrors = CopyOnWriteArrayList<String>()

    @Volatile var down = false

    @Volatile var plan: Today = starterPlan

    // Тренировки: что выдать и что пришло.
    @Volatile var trainingOptions: TrainingOptions = Fixtures.options(listOf(Fixtures.timedPreset))

    @Volatile var nextSession: TrainingSession = Fixtures.session(Fixtures.tc1, Fixtures.se)

    val starts = CopyOnWriteArrayList<TrainingRequest>()
    val answers = CopyOnWriteArrayList<AnswerBatch>()
    val finishes = CopyOnWriteArrayList<TrainingFinish>()
    val reports = CopyOnWriteArrayList<QuestionReport>()

    val url get() = server.url("/")

    init {
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse = handle(request)
            }
        server.start()
    }

    /** Сессия, выданная раньше (вход уже сохранён на устройстве). */
    fun issue(token: String) {
        valid += token
    }

    /** Сессия истекла или вышли на другом устройстве. */
    fun expire(token: String) {
        valid -= token
    }

    private fun handle(request: RecordedRequest): MockResponse {
        if (down) {
            return MockResponse
                .Builder()
                .code(503)
                .body("Service Unavailable")
                .build()
        }
        val token = request.headers["Authorization"]?.removePrefix("Bearer ")
        val path = request.target.substringBefore('?')
        if (path.startsWith("/api/trainings") || path.startsWith("/api/questions/")) {
            return if (token != null && token in valid) trainings(path, request) else error(401, "unauthorized")
        }
        return when (path) {
            "/api/auth/dev" -> {
                val body = ApiJson.decodeFromString(DevSignIn.serializer(), request.body!!.utf8())
                val fresh = "tok-${body.name}-${issued.incrementAndGet()}"
                valid += fresh
                json(200, ApiJson.encodeToString(Session.serializer(), session(fresh)))
            }

            "/api/today" -> {
                if (token != null && token in valid) {
                    json(200, ApiJson.encodeToString(Today.serializer(), plan))
                } else {
                    error(401, "unauthorized")
                }
            }

            "/api/auth/logout" -> {
                if (token != null) {
                    valid -= token
                    signedOutTokens += token
                }
                MockResponse.Builder().code(204).build()
            }

            "/api/client-errors" -> {
                clientErrors += request.body!!.utf8()
                MockResponse.Builder().code(204).build()
            }

            else -> {
                error(404, "not_found")
            }
        }
    }

    /** Тренировки по договору: варианты, начало, ответы, конец, жалобы. */
    private fun trainings(
        path: String,
        request: RecordedRequest,
    ): MockResponse {
        val body = request.body?.utf8().orEmpty()
        return when {
            path == "/api/trainings/options" -> {
                json(200, ApiJson.encodeToString(TrainingOptions.serializer(), trainingOptions))
            }

            path == "/api/trainings" -> {
                starts += ApiJson.decodeFromString(TrainingRequest.serializer(), body)
                json(201, ApiJson.encodeToString(TrainingSession.serializer(), nextSession))
            }

            path.endsWith("/answers") -> {
                answers += ApiJson.decodeFromString(AnswerBatch.serializer(), body)
                MockResponse.Builder().code(204).build()
            }

            path.endsWith("/finish") -> {
                finishes += ApiJson.decodeFromString(TrainingFinish.serializer(), body)
                json(200, ApiJson.encodeToString(TrainingSummary.serializer(), TrainingSummary(0, 1, 0, 0, emptyList())))
            }

            path.endsWith("/reports") -> {
                reports += ApiJson.decodeFromString(QuestionReport.serializer(), body)
                MockResponse.Builder().code(204).build()
            }

            else -> {
                error(404, "not_found")
            }
        }
    }

    private fun json(
        code: Int,
        body: String,
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", "application/json")
        .addHeader("X-Request-Id", "req-fake")
        .body(body)
        .build()

    private fun error(
        code: Int,
        machine: String,
    ) = json(code, """{"code":"$machine","message":"fake","requestId":"req-fake"}""")
}
