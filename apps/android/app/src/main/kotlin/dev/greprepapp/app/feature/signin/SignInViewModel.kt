package dev.greprepapp.app.feature.signin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.greprepapp.api.ApiFailure
import dev.greprepapp.api.ApiResult
import dev.greprepapp.api.apiCall
import dev.greprepapp.api.apis.AuthApi
import dev.greprepapp.api.models.DevSignIn
import dev.greprepapp.api.models.SessionTransport
import dev.greprepapp.app.core.AppConfig
import dev.greprepapp.app.core.report.ClientErrorReporter
import dev.greprepapp.app.core.session.SessionManager
import dev.greprepapp.app.core.session.isStorageFailure
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Вход вне Telegram: Telegram, Apple, Google (PRODUCT.md, «Stack», вход) и подмена в отладочной сборке. */
@HiltViewModel
class SignInViewModel
    @Inject
    constructor(
        private val api: AuthApi,
        private val session: SessionManager,
        private val config: AppConfig,
        private val reporter: ClientErrorReporter,
    ) : ViewModel() {
        enum class Method { Telegram, Apple, Google, Development }

        /** Что сказать под кнопками. Без всплывающих окон: ответ рядом с тем, что нажали (PRODUCT.md, доступность). */
        sealed interface Message {
            data class NotConnectedYet(
                val method: Method,
            ) : Message

            data object Offline : Message

            data object TooManyAttempts : Message

            data object Failed : Message
        }

        data class UiState(
            val busy: Method? = null,
            val message: Message? = null,
        )

        private val mutableState = MutableStateFlow(UiState())
        val state: StateFlow<UiState> = mutableState.asStateFlow()

        /**
         * Telegram, Apple и Google: у провайдеров ещё нет аккаунтов (задача «ждёт Дарью»), поэтому кнопки честно
         * отвечают «ещё не подключён» — как в приложении Apple. Сам вход (окно браузера с PKCE, Credential
         * Manager) появится вместе с ключами провайдеров.
         */
        fun signInWith(method: Method) {
            if (mutableState.value.busy != null || method == Method.Development) return
            mutableState.update { it.copy(message = Message.NotConnectedYet(method)) }
        }

        /** Вход подменой (`/api/auth/dev`): локально и в сценариях. В релизной сборке недоступен. */
        fun signInForDevelopment(name: String) {
            val trimmed = name.trim()
            if (!config.devSignInAvailable || trimmed.isEmpty() || mutableState.value.busy != null) return
            mutableState.value = UiState(busy = Method.Development)
            viewModelScope.launch {
                val result =
                    apiCall {
                        api.signInForDevelopment(
                            DevSignIn(name = trimmed, transport = SessionTransport.BEARER, clientKind = config.clientKind),
                        )
                    }
                when (result) {
                    is ApiResult.Ok -> finish(result.value.token)
                    is ApiResult.Failed -> fail(result.failure)
                }
            }
        }

        private suspend fun finish(token: String?) {
            if (token.isNullOrEmpty()) {
                // Сервер обязан вернуть токен при transport=bearer: без него — разошлись с договором.
                fail(ApiFailure.Unexpected("sign-in: session without token"))
                return
            }
            try {
                session.didSignIn(token)
                mutableState.value = UiState()
            } catch (failure: Exception) {
                if (!failure.isStorageFailure()) throw failure
                // Токен не сохранился (Keystore, диск) — человек остаётся на экране входа и видит ошибку.
                storageFailed(failure)
            }
        }

        private fun storageFailed(failure: Exception) {
            reporter.report("token save failed: ${failure.javaClass.simpleName}", route = ROUTE)
            mutableState.value = UiState(message = Message.Failed)
        }

        private fun fail(failure: ApiFailure) {
            val message =
                when {
                    failure == ApiFailure.Offline -> {
                        Message.Offline
                    }

                    failure is ApiFailure.Server && (failure.status == TOO_MANY || failure.code == "too_many_requests") -> {
                        Message.TooManyAttempts
                    }

                    else -> {
                        Message.Failed
                    }
                }
            // Отказ сервера, который не объясняется сетью или частотой (400, 403…), — расхождение с договором.
            if (failure.isReportable || (failure is ApiFailure.Server && message == Message.Failed)) {
                reporter.report("sign-in: $failure", route = ROUTE, requestId = failure.requestIdOrNull)
            }
            mutableState.value = UiState(message = message)
        }

        private companion object {
            const val ROUTE = "sign-in"
            const val TOO_MANY = 429
        }
    }
