package dev.greprepapp.app.testing

import dev.greprepapp.app.core.AppConfig
import dev.greprepapp.app.core.report.ClientErrorReporter
import dev.greprepapp.app.core.session.SessionManager
import dev.greprepapp.app.core.session.TokenHolder
import dev.greprepapp.app.feature.today.TodayCache
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
    dispatcher: TestDispatcher,
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
    val cache = TodayCache(directory)
    val serverSignOuts = mutableListOf<String>()
    val session =
        SessionManager(
            tokens = tokens,
            holder = holder,
            personal = setOf(cache),
            serverSignOut = { serverSignOuts += it },
            reporter = reporter,
            scope = appScope,
            io = dispatcher,
        )

    /** Дождаться, пока прочитается сохранённый вход и всё фоновое закончится. */
    fun settle() = scope.advanceUntilIdle()
}
