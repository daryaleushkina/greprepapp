package dev.greprepapp.app.core.session

import dev.greprepapp.app.core.AppScope
import dev.greprepapp.app.core.IoDispatcher
import dev.greprepapp.app.core.report.ClientErrorReporter
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/** Данные одного человека на устройстве: стираются при входе другого и при выходе. */
fun interface PersonalData {
    fun clear()
}

/** Почему человек снова на экране входа — чтобы не гадал, куда делся вход. */
enum class SignOutReason { SessionExpired, }

sealed interface SessionState {
    /** Читаем сохранённый вход: держится заставка запуска, экран не мигает входом. */
    data object Restoring : SessionState

    data class SignedOut(
        val reason: SignOutReason?,
    ) : SessionState

    /** id — номер входа на этом устройстве: ответы, пришедшие после выхода, по нему отбрасываются. */
    data class SignedIn(
        val id: Long,
    ) : SessionState
}

/** Токен для заголовка Authorization: читается в потоке OkHttp на каждый запрос, без обращения к Keystore. */
@Singleton
class TokenHolder
    @Inject
    constructor() {
        @Volatile
        var token: String? = null
    }

/** Отправить серверу «выйти» с явным токеном — после выхода на устройстве токена в TokenHolder уже нет. */
fun interface ServerSignOut {
    suspend fun signOut(token: String)
}

/**
 * Корень состояния: вошёл человек или нет. Вход живёт в Keystore: открыл приложение — сразу «Сегодня», без
 * ожидания сети; протух — первый же запрос ответит 401 и вернёт на вход (handleUnauthorized). Поведение то
 * же, что у приложения Apple (AppModel).
 */
@Singleton
class SessionManager
    @Inject
    constructor(
        private val tokens: TokenStore,
        private val holder: TokenHolder,
        private val personal: Set<@JvmSuppressWildcards PersonalData>,
        private val serverSignOut: ServerSignOut,
        private val reporter: ClientErrorReporter,
        @param:AppScope private val scope: CoroutineScope,
        @param:IoDispatcher private val io: CoroutineDispatcher,
    ) {
        private val mutex = Mutex()
        private var counter = 0L
        private val mutableState = MutableStateFlow<SessionState>(SessionState.Restoring)
        val state: StateFlow<SessionState> = mutableState.asStateFlow()

        init {
            scope.launch(io) { restore() }
        }

        /** Ответ, пришедший для входа id, ещё нужен: человек не вышел и не вошёл заново. */
        fun isCurrent(id: Long): Boolean = (state.value as? SessionState.SignedIn)?.id == id

        private suspend fun restore() =
            mutex.withLock {
                val token =
                    try {
                        tokens.read()
                    } catch (failure: Exception) {
                        if (!failure.isStorageFailure()) throw failure
                        // Ключ Keystore испорчен или файл не читается: вход не восстановить — стереть и войти заново.
                        reporter.report("token read failed: ${failure.javaClass.simpleName}", route = "launch")
                        clearTokenQuietly()
                        null
                    }
                if (token.isNullOrEmpty()) {
                    mutableState.value = SessionState.SignedOut(null)
                } else {
                    holder.token = token
                    mutableState.value = SessionState.SignedIn(++counter)
                }
            }

        /** Вход прошёл: токен — в Keystore, данные прошлого человека — прочь. Не сохранился — бросает. */
        suspend fun didSignIn(token: String) =
            withContext(io) {
                mutex.withLock {
                    tokens.save(token)
                    holder.token = token
                    clearPersonal("sign-in")
                    mutableState.value = SessionState.SignedIn(++counter)
                }
            }

        /**
         * Выход: на устройстве — сразу и до конца (токен, данные), на сервере — следом, без ожидания. Не дошло
         * до сервера (нет сети) — токена на устройстве уже нет, а сессия на сервере истечёт сама.
         */
        fun signOut() {
            scope.launch(io) {
                val token = mutex.withLock { forget(reason = null) }
                if (token != null) serverSignOut.signOut(token)
            }
        }

        /**
         * Записать личные данные входа id (кэш плана), только если человек ещё не вышел. Под тем же замком, что
         * выход: иначе ответ, проверенный до выхода, записался бы на диск уже после того, как выход всё стёр.
         */
        suspend fun writeIfCurrent(
            id: Long,
            write: () -> Unit,
        ): Boolean =
            withContext(io) {
                mutex.withLock {
                    if (!isCurrent(id)) return@withLock false
                    write()
                    true
                }
            }

        /** Сервер ответил 401 на запрос входа id: сессии больше нет (истекла или вышли на другом устройстве). */
        fun handleUnauthorized(id: Long) {
            scope.launch(io) {
                mutex.withLock {
                    // Поздний 401 от прошлого входа не выкидывает того, кто вошёл после.
                    if (isCurrent(id)) forget(SignOutReason.SessionExpired)
                }
            }
        }

        private fun forget(reason: SignOutReason?): String? {
            val token = holder.token
            holder.token = null
            try {
                tokens.clear()
            } catch (failure: Exception) {
                if (!failure.isStorageFailure()) throw failure
                reporter.report("token clear failed: ${failure.javaClass.simpleName}", route = "sign-out")
                // Не стёрся — затереть пустым: пустой токен — это «не вошёл», вход не вернётся при запуске.
                try {
                    tokens.save("")
                } catch (again: Exception) {
                    if (!again.isStorageFailure()) throw again
                    // Отчёт уже ушёл; в памяти токена нет — до перезапуска человек вышел.
                }
            }
            clearPersonal("sign-out")
            mutableState.value = SessionState.SignedOut(reason)
            return token
        }

        private fun clearPersonal(route: String) {
            for (data in personal) {
                try {
                    data.clear()
                } catch (failure: Exception) {
                    if (!failure.isStorageFailure()) throw failure
                    // Только класс ошибки: в тексте — путь к файлу.
                    reporter.report("personal data clear failed: ${failure.javaClass.simpleName}", route = route)
                }
            }
        }

        private fun clearTokenQuietly() {
            try {
                tokens.clear()
            } catch (failure: Exception) {
                if (!failure.isStorageFailure()) throw failure
                reporter.report("token clear failed: ${failure.javaClass.simpleName}", route = "launch")
            }
        }
    }
