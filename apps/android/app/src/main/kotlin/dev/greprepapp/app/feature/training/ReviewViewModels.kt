package dev.greprepapp.app.feature.training

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.greprepapp.api.models.QuestionReport
import dev.greprepapp.app.core.report.takeCodePoints
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Тренировка для экранов разбора (макет R16) — только чтение. null — её нет на устройстве. */
@HiltViewModel(assistedFactory = ReviewViewModel.Factory::class)
class ReviewViewModel
    @AssistedInject
    constructor(
        @Assisted trainingId: String,
        repository: TrainingRepository,
    ) : ViewModel() {
        @AssistedFactory
        interface Factory {
            fun create(trainingId: String): ReviewViewModel
        }

        sealed interface UiState {
            data object Loading : UiState

            data object Missing : UiState

            data class Ready(
                val training: StoredTraining,
                val result: TrainingResult,
            ) : UiState
        }

        val state: StateFlow<UiState> =
            repository
                .training(trainingId)
                .map { t -> if (t == null) UiState.Missing else UiState.Ready(t, TrainingRules.result(t)) }
                .stateIn(viewModelScope, SharingStarted.Eagerly, UiState.Loading)
    }

/**
 * «Сообщить об ошибке» (макет R17): где ошибка и что не так. Отправка — через очередь: без сети жалоба уйдёт
 * потом, а человек сразу видит «Спасибо».
 */
@HiltViewModel(assistedFactory = ReportViewModel.Factory::class)
class ReportViewModel
    @AssistedInject
    constructor(
        @Assisted("question") private val questionId: String,
        @Assisted("training") private val trainingId: String,
        private val repository: TrainingRepository,
    ) : ViewModel() {
        @AssistedFactory
        interface Factory {
            fun create(
                @Assisted("question") questionId: String,
                @Assisted("training") trainingId: String,
            ): ReportViewModel
        }

        data class UiState(
            val kind: QuestionReport.Kind? = null,
            val text: String = "",
            val sending: Boolean = false,
            val sent: Boolean = false,
        ) {
            val canSend: Boolean get() = kind != null && !sending && !sent
        }

        private val mutableState = MutableStateFlow(UiState())
        val state: StateFlow<UiState> = mutableState.asStateFlow()

        fun setKind(kind: QuestionReport.Kind) = mutableState.update { it.copy(kind = kind) }

        fun setText(text: String) = mutableState.update { it.copy(text = text.takeCodePoints(MAX_TEXT)) }

        fun send() {
            val s = mutableState.value
            val kind = s.kind ?: return
            if (!s.canSend) return
            mutableState.update { it.copy(sending = true) }
            viewModelScope.launch {
                val text = s.text.trim().takeIf { it.isNotEmpty() }
                repository.report(questionId, QuestionReport(kind = kind, text = text, trainingId = trainingId))
                mutableState.update { it.copy(sending = false, sent = true) }
            }
        }

        private companion object {
            /** Как в договоре (QuestionReport.text, maxLength — в символах Unicode, не в UTF-16). */
            const val MAX_TEXT = 2000
        }
    }
