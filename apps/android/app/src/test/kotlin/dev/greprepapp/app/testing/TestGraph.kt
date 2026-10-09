package dev.greprepapp.app.testing

import dev.greprepapp.app.core.AppConfig
import dev.greprepapp.app.core.report.ClientErrorReporter
import dev.greprepapp.app.core.session.SessionManager
import dev.greprepapp.app.core.session.TokenHolder
import dev.greprepapp.app.feature.today.TodayCache
import dev.greprepapp.app.feature.training.TrainingRepository
import dev.greprepapp.app.feature.training.TrainingStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.io.File

/** Части приложения без Hilt: настоящие SessionManager, кэш и отчёты поверх подменного сервера. */
@OptIn(ExperimentalCoroutinesApi::class)
class TestGraph(
    private val scope: TestScope,
    private val dispatcher: TestDispatcher,
    directory: File,
    token: String? = null,
    devSignIn: Boolean = true,
) {
    val tokens = MemoryTokenStore(token)
    val holder = TokenHolder()
    val publicApi = FakePublicApi()
    val clock = MutableClock()
    val config = AppConfig("http://127.0.0.1/".toHttpUrl(), "0.1.0 (1)", devSignInAvailable = devSignIn)

    // Не backgroundScope: его задачи advanceUntilIdle не ждёт, а тесту нужен итог фоновой работы.
    val appScope = CoroutineScope(SupervisorJob() + dispatcher)
    val reporter = ClientErrorReporter({ publicApi }, config, clock, appScope)
    val cache = TodayCache(directory, reporter)
    val trainingStore = TrainingStore(directory)
    val serverSignOuts = mutableListOf<String>()
    var ownerCalls = 0
    var ownerReply: dev.greprepapp.api.ApiResult<String> =
        dev.greprepapp.api.ApiResult
            .Ok(session().user.id)
    var ownerGate: kotlinx.coroutines.CompletableDeferred<Unit>? = null
    val session =
        SessionManager(
            tokens = tokens,
            holder = holder,
            personal = setOf(cache, trainingStore),
            serverSignOut = { serverSignOuts += it },
            reporter = reporter,
            account = {
                ownerCalls++
                ownerGate?.await()
                ownerReply
            },
            scope = appScope,
            io = dispatcher,
        )

    val trainingsApi = FakeTrainingsApi()
    val network = FakeNetwork()
    val foreground = FakeForeground()
    val ticker = ManualTicker()

    /** Тренировки поверх подменного сервера; создаются по первому обращению, как синглтон Hilt. */
    val trainings: TrainingRepository by lazy {
        TrainingRepository(
            api = trainingsApi,
            store = trainingStore,
            session = session,
            reporter = reporter,
            clock = clock,
            network = network,
            foreground = foreground,
            scope = appScope,
            io = dispatcher,
        )
    }

    /** Дождаться, пока прочитается сохранённый вход и всё фоновое закончится. */
    fun settle() = scope.advanceUntilIdle()
}
