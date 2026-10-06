package dev.greprepapp.app.feature.today

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.greprepapp.api.ApiFailure
import dev.greprepapp.api.ApiResult
import dev.greprepapp.api.apiCall
import dev.greprepapp.api.apis.TodayApi
import dev.greprepapp.api.models.Today
import dev.greprepapp.app.core.AppForeground
import dev.greprepapp.app.core.IoDispatcher
import dev.greprepapp.app.core.NetworkStatus
import dev.greprepapp.app.core.report.ClientErrorReporter
import dev.greprepapp.app.core.session.SessionManager
import dev.greprepapp.app.core.session.SessionState
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException
import java.time.Clock
import java.time.Duration
import java.time.Instant
import javax.inject.Inject

/**
 * Экран «Сегодня»: план с сервера, а без сети — прошлый план со строкой «Нет сети» (решение Даши 06.10.2026).
 * Живёт, пока человек вошёл: выход убирает экран из стопки навигации, и модель вместе с запросами в пути
 * отменяется; ответ, успевший прийти после выхода, отбрасывается по номеру входа.
 */
@HiltViewModel
class TodayViewModel
    @Inject
    constructor(
        private val api: TodayApi,
        private val cache: TodayCache,
        private val session: SessionManager,
        private val network: NetworkStatus,
        private val reporter: ClientErrorReporter,
        private val clock: Clock,
        foreground: AppForeground,
        @param:IoDispatcher private val io: CoroutineDispatcher,
    ) : ViewModel() {
        enum class Problem { Offline, Failed }

        sealed interface Content {
            data object Loading : Content

            data class Plan(
                val plan: TodayPlan,
            ) : Content

            /** Плана нет ни с сервера, ни на устройстве. */
            data class Unavailable(
                val problem: Problem,
            ) : Content
        }

        data class UiState(
            val content: Content = Content.Loading,
            /** На экране прошлый план: обновить не удалось. null — план свежий. */
            val stale: Problem? = null,
            val isRefreshing: Boolean = false,
            /** Шаг, у которого показано «чтобы начать, нужна сеть». */
            val blockedStepId: String? = null,
        )

        private val sessionId = (session.state.value as? SessionState.SignedIn)?.id
        private val mutableState = MutableStateFlow(UiState())
        val state: StateFlow<UiState> = mutableState.asStateFlow()

        private var refreshJob: Job? = null
        private var fetchedAt: Instant? = null

        init {
            viewModelScope.launch {
                // Прошлый план — сразу, до ответа сервера: экран не мигает пустотой при каждом открытии.
                // Чтение файла — миллисекунды, поэтому запрос уходит после него и не обгоняет его.
                val cached = withContext(io) { cache.load() }
                if (cached != null) mutableState.update { it.copy(content = Content.Plan(cached)) }
                refresh()
            }
            viewModelScope.launch {
                // Сеть пропала — над планом тихая строка «Нет сети»; вернулась — план обновляется сам
                // (решение Даши 06.10.2026), даже если запросов без сети не было.
                network.isOnline.drop(1).collect { online ->
                    if (online) {
                        mutableState.update { it.copy(blockedStepId = null) }
                        if (needsRefresh()) refresh()
                    } else {
                        mutableState.update {
                            if (it.content is Content.Plan && it.stale == null) it.copy(stale = Problem.Offline) else it
                        }
                    }
                }
            }
            viewModelScope.launch {
                foreground.events.collect { refreshIfStale() }
            }
        }

        private fun needsRefresh(): Boolean {
            val current = mutableState.value
            return current.stale != null || current.content is Content.Unavailable
        }

        /**
         * Возврат в приложение — частое событие: план перезапрашивается, только если он старше пяти минут или его
         * обновить не удалось. План дня меняется после тренировки, а не каждую минуту.
         */
        fun refreshIfStale() {
            // Первый ответ ещё в пути (медленная сеть, свернул и вернулся) — не обрывать его новым запросом.
            if (refreshJob?.isActive == true) return
            val last = fetchedAt
            if (last != null && mutableState.value.stale == null &&
                Duration.between(last, clock.instant()) < FRESH_FOR
            ) {
                return
            }
            refresh()
        }

        fun refresh() {
            val id = sessionId ?: return
            refreshJob?.cancel()
            mutableState.update { it.copy(isRefreshing = true) }
            refreshJob =
                viewModelScope.launch {
                    val result = apiCall { api.getToday() }
                    if (!session.isCurrent(id)) return@launch
                    when (result) {
                        is ApiResult.Ok -> show(result.value, id)
                        is ApiResult.Failed -> handle(result.failure, id)
                    }
                    mutableState.update { it.copy(isRefreshing = false) }
                }
        }

        /** Новую сессию без сети не начать (PRODUCT.md, «Operating Context»): вместо перехода — объяснение у шага. */
        fun canStart(step: TodayPlan.Step): Boolean {
            val offline = !network.isOnline.value || mutableState.value.stale == Problem.Offline
            mutableState.update { it.copy(blockedStepId = if (offline) step.id else null) }
            return !offline
        }

        private suspend fun show(
            dto: Today,
            id: Long,
        ) {
            mutableState.update { it.copy(content = Content.Plan(TodayPlan.from(dto)), stale = null) }
            fetchedAt = clock.instant()
            try {
                session.writeIfCurrent(id) { cache.save(dto) }
            } catch (failure: IOException) {
                // Только класс: в тексте ошибки — путь к файлу.
                reporter.report("today cache write failed: ${failure.javaClass.simpleName}", route = ROUTE)
            }
        }

        private fun handle(
            failure: ApiFailure,
            id: Long,
        ) {
            when (failure) {
                ApiFailure.Unauthorized -> {
                    session.handleUnauthorized(id)
                }

                ApiFailure.Offline -> {
                    showProblem(Problem.Offline)
                }

                is ApiFailure.Server, is ApiFailure.Unexpected -> {
                    // Любой отказ сервера на план дня — наш баг (клиент и сервер разошлись), не только 5xx.
                    reporter.report("today: $failure", route = ROUTE, requestId = failure.requestIdOrNull)
                    showProblem(Problem.Failed)
                }
            }
        }

        private fun showProblem(problem: Problem) {
            mutableState.update {
                if (it.content is Content.Plan) {
                    it.copy(stale = problem)
                } else {
                    it.copy(content = Content.Unavailable(problem))
                }
            }
        }

        private companion object {
            val FRESH_FOR: Duration = Duration.ofMinutes(5)
            const val ROUTE = "today"
        }
    }
