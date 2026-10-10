package dev.greprepapp.app.feature.training

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.greprepapp.api.models.Question
import dev.greprepapp.api.models.TrainingMode
import dev.greprepapp.api.models.TrainingRequest
import dev.greprepapp.app.core.Ticker
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Clock

/**
 * Сессия тренировки (макеты R3–R6, R9, R14, R15). «Практика»: выбрал → «Проверить» или «Не знаю» → разбор →
 * «Дальше». «Проверка»: таймер темпа экзамена, ответ сохраняется сразу при выборе, можно пропустить, отметить и
 * вернуться; после последнего вопроса — список вопросов и «Закончить»; время вышло — сессия кончается сама.
 * Всё живёт на устройстве (TrainingRepository) — без сети тренировка идёт так же.
 */
@HiltViewModel(assistedFactory = SessionViewModel.Factory::class)
class SessionViewModel
    @AssistedInject
    constructor(
        @Assisted private val trainingId: String,
        private val repository: TrainingRepository,
        private val clock: Clock,
        private val ticker: Ticker,
    ) : ViewModel() {
        @AssistedFactory
        interface Factory {
            fun create(trainingId: String): SessionViewModel
        }

        /** То, что видно на экране сейчас. */
        data class Screen(
            val training: StoredTraining,
            val position: Int,
            /** Выбор на экране. В «Проверке» он же сохранённый ответ, в «Практике» — до «Проверить». */
            val selection: List<String>,
            val remainingSeconds: Int?,
            /** Список вопросов «Проверки» — после последнего вопроса и по кнопке в шапке. */
            val overview: Boolean,
            /** Язык разбора; null — как интерфейс. */
            val english: Boolean?,
            /** Второй уровень разбора — «Почему не …?». */
            val whyNotOpen: Boolean,
            /** Отметки «вернуться», нажатые сейчас: на диск они попадают чуть позже. */
            val flags: Map<Int, Boolean> = emptyMap(),
        ) {
            fun flaggedAt(position: Int): Boolean = flags[position] ?: (training.answer(position)?.flagged == true)

            val question: Question get() = training.question(position)
            val isLast: Boolean get() = position == training.total - 1

            /** «Практика»: ответ уже проверен — виден разбор. */
            val revealed: Boolean get() = !training.isCheck && training.answer(position) != null
            val flagged: Boolean get() = flaggedAt(position)
            val canCheck: Boolean get() = TrainingRules.isComplete(question, selection)
            val missing: List<Int> get() = TrainingRules.missingGroups(question, selection)
            val keyboardGroup: dev.greprepapp.api.models.OptionGroup?
                get() =
                    if (question.groups.size ==
                        1
                    ) {
                        question.groups.firstOrNull()
                    } else {
                        question.groups.getOrNull(missing.firstOrNull() ?: 0)
                    }
            val result: TrainingResult? get() = if (training.isFinished) TrainingRules.result(training) else null
        }

        sealed interface UiState {
            data object Loading : UiState

            /** Тренировки на устройстве нет (стёрта при выходе или устарела). */
            data object Missing : UiState

            data class Active(
                val screen: Screen,
            ) : UiState
        }

        private data class Local(
            val position: Int? = null,
            val selection: List<String> = emptyList(),
            val overview: Boolean = false,
            val english: Boolean? = null,
            val whyNotOpen: Boolean = false,
            val now: Long = 0,
            val flags: Map<Int, Boolean> = emptyMap(),
        )

        private val local = MutableStateFlow(Local(now = clock.millis()))
        private var shownAt = clock.millis()
        private var timer: Job? = null

        /** Повтор по «Что повторить» начался — экран переходит к нему (consumeRepeat). */
        private val repeatState = MutableStateFlow(RepeatState())
        val repeat: StateFlow<RepeatState> = repeatState

        data class RepeatState(
            val starting: Boolean = false,
            val problem: StartProblem? = null,
            val started: String? = null,
        )

        val state: StateFlow<UiState> =
            combine(repository.training(trainingId), local) { training, l ->
                if (training == null) UiState.Missing else UiState.Active(build(training, l))
            }.stateIn(viewModelScope, SharingStarted.Eagerly, UiState.Loading)

        private fun build(
            training: StoredTraining,
            l: Local,
        ): Screen {
            val position = (l.position ?: training.position).coerceIn(0, training.total - 1)
            return Screen(
                training = training,
                position = position,
                selection = if (l.position == null) initialSelection(training, position) else l.selection,
                remainingSeconds = TrainingRules.remainingSeconds(training, l.now),
                overview = l.overview,
                english = l.english,
                whyNotOpen = l.whyNotOpen,
                flags = l.flags,
            )
        }

        init {
            viewModelScope.launch {
                // Экран встаёт на вопрос, где человек остановился; у «Проверки» включается таймер.
                val training = repository.training(trainingId).filterNotNull().first()
                val position = training.position.coerceIn(0, training.total - 1)
                local.update { it.copy(position = position, selection = initialSelection(training, position)) }
                shownAt = clock.millis()
                if (training.isCheck && !training.isFinished) startTimer()
            }
        }

        private fun initialSelection(
            training: StoredTraining,
            position: Int,
        ): List<String> = training.answer(position)?.optionIds.orEmpty()

        private fun startTimer() {
            timer =
                viewModelScope.launch {
                    ticker.ticks().collect {
                        val now = clock.millis()
                        local.update { it.copy(now = now) }
                        // Остаток — по часам сейчас, а не по экрану: экран пересчитается чуть позже.
                        val training = screen()?.training ?: return@collect
                        if (training.isFinished) {
                            timer?.cancel()
                        } else if (TrainingRules.remainingSeconds(training, now) == 0) {
                            repository.recordFinish(trainingId, timedOut = true)
                        }
                    }
                }
        }

        /**
         * Экран сейчас — из последних данных, а не из state: тот пересчитывается асинхронно, и действие сразу после
         * нажатия увидело бы прошлый выбор.
         */
        private fun screen(): Screen? = repository.trainings.value[trainingId]?.let { build(it, local.value) }

        private fun elapsed(): Int = (clock.millis() - shownAt).toInt().coerceAtLeast(0)

        fun select(optionId: String) {
            val s = screen() ?: return
            if (s.training.isFinished || s.revealed) return
            val next = TrainingRules.toggle(s.question, s.selection, optionId)
            local.update { it.copy(selection = next) }
            // «Проверка» сохраняет выбор сразу: закрыл приложение — ответ не потерялся.
            if (s.training.isCheck) save(s.position, next, flagged = s.flagged)
        }

        /** «Практика»: «Проверить» — ответ записан, виден разбор. */
        fun check() {
            val s = screen() ?: return
            if (s.training.isCheck || s.revealed || !s.canCheck) return
            local.update { it.copy(whyNotOpen = false) }
            save(s.position, s.selection, flagged = false)
        }

        /** «Практика»: «Не знаю» вместо пропуска — разбор сразу, а в «Что повторить» это ошибка. */
        fun dontKnow() {
            val s = screen() ?: return
            if (s.training.isCheck || s.revealed) return
            local.update { it.copy(selection = emptyList(), whyNotOpen = false) }
            repository.recordAnswer(trainingId, s.position, emptyList(), dontKnow = true, elapsedMs = elapsed())
        }

        fun toggleFlag() {
            val s = screen() ?: return
            if (!s.training.isCheck || s.training.isFinished) return
            val flagged = !s.flagged
            local.update { it.copy(flags = it.flags + (s.position to flagged)) }
            save(s.position, s.selection, flagged = flagged)
        }

        private fun save(
            position: Int,
            selection: List<String>,
            flagged: Boolean,
        ) {
            repository.recordAnswer(trainingId, position, selection, flagged = flagged, elapsedMs = elapsed())
        }

        /** «Дальше» и «Пропустить»: на последнем вопросе «Практика» заканчивается, «Проверка» — к списку. */
        fun next() {
            val s = screen() ?: return
            // В «Практике» дальше — только после разбора: пропуска там нет, есть «Не знаю».
            if (!s.training.isCheck && !s.revealed) return
            when {
                !s.isLast -> go(s.position + 1)
                s.training.isCheck -> local.update { it.copy(overview = true) }
                else -> finish()
            }
        }

        fun previous() {
            val s = screen() ?: return
            if (s.position > 0 && s.training.isCheck) go(s.position - 1)
        }

        fun goTo(position: Int) = go(position)

        private fun go(position: Int) {
            val training = screen()?.training ?: return
            if (position !in 0 until training.total) return
            shownAt = clock.millis()
            local.update {
                it.copy(
                    position = position,
                    selection = initialSelection(training, position),
                    overview = false,
                    whyNotOpen = false,
                )
            }
            repository.recordPosition(trainingId, position)
        }

        fun openOverview() = local.update { it.copy(overview = true) }

        fun closeOverview() = local.update { it.copy(overview = false) }

        fun finish() = repository.recordFinish(trainingId, timedOut = false)

        fun setEnglish(english: Boolean) = local.update { it.copy(english = english) }

        fun toggleWhyNot() = local.update { it.copy(whyNotOpen = !it.whyNotOpen) }

        /** «Повторить · N вопросов»: «Практика» по темам из «Что повторить». */
        fun repeatMistakes() {
            val s = screen() ?: return
            val result = s.result ?: return
            if (result.review.isEmpty() || repeatState.value.starting) return
            val session = s.training.session
            val request =
                TrainingRequest(
                    exam = session.exam ?: CURRENT_EXAM,
                    section = session.section,
                    questionTypes = session.questionTypes.toSet(),
                    count = TrainingRules.repeatCount(result.review.sumOf { it.mistakes }),
                    mode = TrainingMode.PRACTICE,
                    topicIds = result.review.map { it.topicId },
                )
            repeatState.value = RepeatState(starting = true)
            viewModelScope.launch {
                repeatState.value =
                    when (val started = repository.start(request)) {
                        is StartResult.Started -> {
                            RepeatState(started = started.trainingId)
                        }

                        StartResult.NoQuestions -> {
                            RepeatState(problem = StartProblem.NoQuestions)
                        }

                        is StartResult.Failed -> {
                            RepeatState(
                                problem =
                                    if (started.problem ==
                                        TrainingProblem.Offline
                                    ) {
                                        StartProblem.Offline
                                    } else {
                                        StartProblem.Failed
                                    },
                            )
                        }
                    }
            }
        }

        fun consumeRepeat() {
            repeatState.value = RepeatState()
        }
    }
