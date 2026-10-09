package dev.greprepapp.app.feature.training

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.greprepapp.api.ApiFailure
import dev.greprepapp.api.ApiResult
import dev.greprepapp.api.models.Difficulty
import dev.greprepapp.api.models.QuestionType
import dev.greprepapp.api.models.Section
import dev.greprepapp.api.models.TrainingMode
import dev.greprepapp.api.models.TrainingOptions
import dev.greprepapp.api.models.TrainingPreset
import dev.greprepapp.api.models.TrainingRequest
import dev.greprepapp.api.models.TrainingTopic
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlin.math.ceil

/** С чего открыть конструктор: шаг «Сегодня» знает раздел, иногда и тип. */
@Serializable
data class BuilderPrefill(
    val section: Section,
    val type: QuestionType? = null,
)

/** Своя сборка конструктора (макет R1): то, что показывают поля. */
data class BuilderForm(
    val section: Section,
    val type: QuestionType,
    /** Как набрано в поле: пустое, пока человек печатает, — не ошибка. */
    val countText: String,
    val mode: TrainingMode,
    /** null — все темы. */
    val topicIds: Set<String>?,
    /** null — любая. */
    val difficulty: Difficulty?,
) {
    val count: Int? get() = countText.toIntOrNull()?.takeIf { it > 0 }
}

enum class StartProblem { NoQuestions, Offline, Failed }

/**
 * Конструктор тренировки: всё уже выбрано (прошлая тренировка или разумное умолчание), «Начать» видно сразу
 * (PRODUCT.md, «Тренировки»). Готовые наборы — переключатель над своей сборкой; правка любого поля выбирает
 * свою сборку.
 */
@HiltViewModel(assistedFactory = BuilderViewModel.Factory::class)
class BuilderViewModel
    @AssistedInject
    constructor(
        @Assisted private val prefill: BuilderPrefill?,
        private val repository: TrainingRepository,
    ) : ViewModel() {
        @AssistedFactory
        interface Factory {
            fun create(prefill: BuilderPrefill?): BuilderViewModel
        }

        sealed interface Content {
            data object Loading : Content

            data class Unavailable(
                val problem: TrainingProblem,
            ) : Content

            data class Ready(
                val options: TrainingOptions,
                val form: BuilderForm,
                /** Выбранный готовый набор (номер в presets); null — своя сборка. */
                val preset: Int?,
            ) : Content {
                /** Наборы, которые приложение знает; незнакомые виды сервер может прислать — пропускаем. */
                val presets: List<TrainingPreset> get() = options.presets.filter { it.kind in KNOWN_PRESETS }
            }
        }

        data class UiState(
            val content: Content = Content.Loading,
            val editingTopics: Boolean = false,
            val starting: Boolean = false,
            val problem: StartProblem? = null,
            /** Тренировка началась: экран переходит к ней и сбрасывает поле (consumeStarted). */
            val started: String? = null,
        )

        private val mutableState = MutableStateFlow(UiState())
        val state: StateFlow<UiState> = mutableState.asStateFlow()
        private var loadJob: Job? = null

        init {
            load()
        }

        fun load() {
            loadJob?.cancel()
            mutableState.update { it.copy(content = Content.Loading) }
            loadJob =
                viewModelScope.launch {
                    when (val result = repository.options()) {
                        is ApiResult.Ok -> {
                            mutableState.update { it.copy(content = ready(result.value)) }
                        }

                        is ApiResult.Failed -> {
                            val problem = if (result.failure == ApiFailure.Offline) TrainingProblem.Offline else TrainingProblem.Failed
                            mutableState.update { it.copy(content = Content.Unavailable(problem)) }
                        }
                    }
                }
        }

        private fun ready(options: TrainingOptions): Content.Ready {
            val presets = options.presets.filter { it.kind in KNOWN_PRESETS }
            val last = presets.indexOfFirst { it.kind == PRESET_LAST }.takeIf { it >= 0 && prefill == null }
            val form =
                when {
                    prefill != null -> defaultForm(options, prefill.section, prefill.type)
                    last != null -> formOf(presets[last].request, options)
                    else -> defaultForm(options, Section.VERBAL, null)
                }
            return Content.Ready(options = options, form = form, preset = last)
        }

        private fun edit(change: (BuilderForm) -> BuilderForm) {
            mutableState.update { s ->
                val c = s.content as? Content.Ready ?: return@update s
                s.copy(content = c.copy(form = change(c.form), preset = null), problem = null)
            }
        }

        fun selectPreset(index: Int) {
            mutableState.update { s ->
                val c = s.content as? Content.Ready ?: return@update s
                val preset = c.presets.getOrNull(index) ?: return@update s
                // Набор с одним типом показывает себя в полях; «Проверка на время» из нескольких типов — нет.
                val form = if (preset.request.questionTypes.size == 1) formOf(preset.request, c.options) else c.form
                s.copy(content = c.copy(form = form, preset = index), problem = null)
            }
        }

        fun setSection(section: Section) =
            edit { f ->
                val c = mutableState.value.content as Content.Ready
                if (f.section == section) f else defaultForm(c.options, section, null).copy(countText = f.countText, mode = f.mode)
            }

        fun setType(type: QuestionType) = edit { f -> if (f.type == type) f else f.copy(type = type, topicIds = null) }

        fun setCount(text: String) = edit { it.copy(countText = text.filter(Char::isDigit).take(COUNT_DIGITS)) }

        fun setMode(mode: TrainingMode) = edit { it.copy(mode = mode) }

        fun setDifficulty(difficulty: Difficulty?) = edit { it.copy(difficulty = difficulty) }

        /** Галочка темы. Сняли последнюю — пусто (кнопка «Готово» выключится), а не «все». */
        fun toggleTopic(topicId: String) =
            edit { f ->
                val c = mutableState.value.content as Content.Ready
                val all = topicsOf(c.options, f).map { it.id }.toSet()
                val current = f.topicIds ?: all
                val next = if (topicId in current) current - topicId else current + topicId
                f.copy(topicIds = if (next == all) null else next)
            }

        fun openTopics() = mutableState.update { it.copy(editingTopics = true) }

        fun closeTopics() = mutableState.update { it.copy(editingTopics = false) }

        fun start() {
            val s = mutableState.value
            val c = s.content as? Content.Ready ?: return
            if (s.starting) return
            val request = requestOf(c) ?: return
            mutableState.update { it.copy(starting = true, problem = null) }
            viewModelScope.launch {
                val result = repository.start(request)
                mutableState.update {
                    when (result) {
                        is StartResult.Started -> {
                            it.copy(starting = false, started = result.trainingId)
                        }

                        StartResult.NoQuestions -> {
                            it.copy(starting = false, problem = StartProblem.NoQuestions)
                        }

                        is StartResult.Failed -> {
                            val problem = if (result.problem == TrainingProblem.Offline) StartProblem.Offline else StartProblem.Failed
                            it.copy(starting = false, problem = problem)
                        }
                    }
                }
            }
        }

        fun consumeStarted() = mutableState.update { it.copy(started = null) }

        companion object {
            const val PRESET_LAST = "last"
            const val PRESET_TIMED = "timed"
            val KNOWN_PRESETS = setOf(PRESET_LAST, PRESET_TIMED)
            private const val DEFAULT_COUNT = 10
            private const val COUNT_DIGITS = 2
            private const val SECONDS_PER_MINUTE = 60.0

            /** Темы выбранного типа; тип, о котором сервер не рассказал, — без тем. */
            fun topicsOf(
                options: TrainingOptions,
                form: BuilderForm,
            ): List<TrainingTopic> =
                options.types
                    .firstOrNull { it.questionType == form.type }
                    ?.topics
                    .orEmpty()

            /** Сколько заданий подходит под темы и сложность. */
            fun available(
                options: TrainingOptions,
                form: BuilderForm,
            ): Int =
                topicsOf(options, form)
                    .filter { form.topicIds == null || it.id in form.topicIds }
                    .sumOf { t ->
                        when (form.difficulty) {
                            null -> t.available.easy + t.available.medium + t.available.hard
                            Difficulty.EASY -> t.available.easy
                            Difficulty.MEDIUM -> t.available.medium
                            Difficulty.HARD -> t.available.hard
                        }
                    }

            /** Запрос «Начать»: выбранный набор как есть или своя сборка; null — начать нельзя. */
            fun requestOf(c: Content.Ready): TrainingRequest? {
                c.preset?.let { return c.presets.getOrNull(it)?.request }
                val f = c.form
                val count = f.count ?: return null
                val questions = minOf(count, available(c.options, f), c.options.maxQuestions)
                if (questions < 1) return null
                return TrainingRequest(
                    exam = CURRENT_EXAM,
                    section = f.section,
                    questionTypes = setOf(f.type),
                    count = questions,
                    mode = f.mode,
                    topicIds = f.topicIds?.toList(),
                    difficulty = f.difficulty,
                )
            }

            /** «~12 мин» на кнопке: темп экзамена по разделу. */
            fun minutes(
                options: TrainingOptions,
                request: TrainingRequest,
            ): Int {
                val pace = options.types.firstOrNull { it.questionType in request.questionTypes }?.paceSeconds ?: 0
                return ceil(request.count * pace / SECONDS_PER_MINUTE).toInt()
            }

            private fun defaultForm(
                options: TrainingOptions,
                section: Section,
                type: QuestionType?,
            ): BuilderForm {
                val inSection = options.types.filter { it.section == section }
                val chosen =
                    type?.takeIf { t -> inSection.any { it.questionType == t } }
                        ?: inSection.firstOrNull { it.topics.isNotEmpty() }?.questionType
                        ?: inSection.firstOrNull()?.questionType
                        ?: if (section == Section.QUANT) QuestionType.QUANTITATIVE_COMPARISON else QuestionType.TEXT_COMPLETION
                return BuilderForm(section, chosen, DEFAULT_COUNT.toString(), TrainingMode.PRACTICE, null, null)
            }

            private fun formOf(
                request: TrainingRequest,
                options: TrainingOptions,
            ): BuilderForm {
                val base = defaultForm(options, request.section, request.questionTypes.firstOrNull())
                return base.copy(
                    countText = request.count.toString(),
                    mode = request.mode,
                    topicIds = request.topicIds?.takeIf { it.isNotEmpty() }?.toSet(),
                    difficulty = request.difficulty,
                )
            }
        }
    }
