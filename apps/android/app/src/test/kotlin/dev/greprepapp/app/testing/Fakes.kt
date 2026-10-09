package dev.greprepapp.app.testing

import dev.greprepapp.api.apis.AuthApi
import dev.greprepapp.api.apis.PublicApi
import dev.greprepapp.api.apis.TodayApi
import dev.greprepapp.api.models.AuthorizationCodeSignIn
import dev.greprepapp.api.models.ClientError
import dev.greprepapp.api.models.DevSignIn
import dev.greprepapp.api.models.Health
import dev.greprepapp.api.models.IdTokenSignIn
import dev.greprepapp.api.models.Locale
import dev.greprepapp.api.models.Role
import dev.greprepapp.api.models.Section
import dev.greprepapp.api.models.Session
import dev.greprepapp.api.models.StepState
import dev.greprepapp.api.models.TelegramMiniAppSignIn
import dev.greprepapp.api.models.Today
import dev.greprepapp.api.models.TodayStep
import dev.greprepapp.api.models.User
import dev.greprepapp.app.core.AppForeground
import dev.greprepapp.app.core.NetworkStatus
import dev.greprepapp.app.core.Ticker
import dev.greprepapp.app.core.session.TokenStore
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.Response
import java.io.IOException
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/** Ответ подменного сервера: тело, ошибка договора или обрыв сети. */
sealed interface Reply<out T> {
    data class Ok<T>(
        val value: T,
    ) : Reply<T>

    data class Error(
        val status: Int,
        val code: String = "internal",
        val requestId: String = "req-test",
    ) : Reply<Nothing>

    data object NetworkDown : Reply<Nothing>
}

fun <T> Reply<T>.toResponse(): Response<T> =
    when (this) {
        is Reply.Ok -> {
            Response.success(value)
        }

        is Reply.Error -> {
            Response.error(
                status,
                """{"code":"$code","message":"test","requestId":"$requestId"}""".toResponseBody(),
            )
        }

        Reply.NetworkDown -> {
            throw IOException("network down")
        }
    }

fun plan(vararg steps: TodayStep): Today = Today(date = "2026-10-06", steps = steps.toList())

fun step(
    id: String,
    section: Section = Section.VERBAL,
    state: StepState = StepState.NEXT,
    minutes: Int = 10,
    title: String = "Шаг $id",
): TodayStep = TodayStep(id = id, section = section, title = title, minutes = minutes, state = state)

/** План по умолчанию — как у сервера каркаса для нового человека (server/internal/today). */
val starterPlan: Today =
    plan(
        step("words", Section.WORDS, StepState.CURRENT, 5, "Слова: повторение"),
        step("verbal", Section.VERBAL, StepState.NEXT, 10, "Verbal: Text Completion"),
        step("quant", Section.QUANT, StepState.NEXT, 10, "Quant: Quantitative Comparison"),
    )

class FakeTodayApi : TodayApi {
    var reply: Reply<Today> = Reply.Ok(starterPlan)
    var calls = 0

    /** Задержать ответ, пока тест не отпустит его (поздний ответ после выхода). */
    var gate: CompletableDeferred<Unit>? = null

    override suspend fun getToday(): Response<Today> {
        calls++
        gate?.await()
        return reply.toResponse()
    }
}

fun session(token: String? = "token-1"): Session =
    Session(
        expiresAt = "2026-11-05T00:00:00Z",
        user =
            User(
                activeExam = null,
                id = "00000000-0000-0000-0000-000000000001",
                name = "Test",
                role = Role.USER,
                locale = Locale.RU,
                identities = emptyList(),
            ),
        token = token,
    )

class FakeAuthApi : AuthApi {
    var reply: Reply<Session> = Reply.Ok(session())
    val devSignIns = mutableListOf<DevSignIn>()

    override suspend fun signInForDevelopment(devSignIn: DevSignIn): Response<Session> {
        devSignIns += devSignIn
        return reply.toResponse()
    }

    override suspend fun signInWithAuthorizationCode(authorizationCodeSignIn: AuthorizationCodeSignIn): Response<Session> =
        error("not used")

    override suspend fun signInWithIdToken(idTokenSignIn: IdTokenSignIn): Response<Session> = error("not used")

    override suspend fun signInWithTelegramMiniApp(telegramMiniAppSignIn: TelegramMiniAppSignIn): Response<Session> = error("not used")

    override suspend fun signOut(): Response<Unit> = error("not used")
}

class FakePublicApi : PublicApi {
    val reports = mutableListOf<ClientError>()

    override suspend fun getExams(): Response<dev.greprepapp.api.models.ExamList> = error("not used")

    override suspend fun getHealth(): Response<Health> = error("not used")

    override suspend fun reportClientError(clientError: ClientError): Response<Unit> {
        reports += clientError
        return Response.success(204, Unit)
    }
}

class MemoryTokenStore(
    var token: String? = null,
) : TokenStore {
    var readFailure: Exception? = null
    var clearFailure: Exception? = null
    var saveFailure: Exception? = null

    override fun read(): String? {
        readFailure?.let { throw it }
        return token
    }

    override fun save(token: String) {
        saveFailure?.let { throw it }
        this.token = token
    }

    override fun clear() {
        clearFailure?.let { throw it }
        token = null
    }
}

class FakeNetwork(
    online: Boolean = true,
) : NetworkStatus {
    override val isOnline = MutableStateFlow(online)
}

class FakeForeground : AppForeground {
    override val events = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
}

/** Часы, которые двигает тест. */
class MutableClock(
    var now: Instant = Instant.parse("2026-10-06T09:00:00Z"),
) : Clock() {
    override fun getZone() = ZoneOffset.UTC

    override fun withZone(zone: java.time.ZoneId?): Clock = this

    override fun instant(): Instant = now
}

/** Таймер «Проверки», который двигает тест: tick() — «прошла секунда» (часы двигаются отдельно). */
class ManualTicker : Ticker {
    private val flow = MutableSharedFlow<Unit>(replay = 1, extraBufferCapacity = 8)

    init {
        flow.tryEmit(Unit)
    }

    override fun ticks(): kotlinx.coroutines.flow.Flow<Unit> = flow

    fun tick() {
        flow.tryEmit(Unit)
    }
}
