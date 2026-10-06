package dev.greprepapp.app.feature.training

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.greprepapp.api.models.QuestionType
import dev.greprepapp.api.models.Section
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/** Незаконченная тренировка для «Продолжить тренировку» на «Сегодня» (макет T1). */
data class ContinueTraining(
    val trainingId: String,
    val section: Section,
    val types: List<QuestionType>,
    /** С нуля: «вопрос 4 из 10» — position + 1. */
    val position: Int,
    val total: Int,
)

/** Вопрос, о котором человек сообщает ошибку, — для экрана «Сообщить об ошибке» (макет R17). */
data class ReportTarget(
    val trainingId: String,
    val position: Int,
    val questionId: String,
    val questionType: QuestionType,
)

fun StoredTraining.reportTarget(position: Int): ReportTarget {
    val q = question(position)
    return ReportTarget(id, position, q.id, q.questionType)
}

/** Начатая и не законченная тренировка — её видно на «Сегодня», пока человек вошёл. */
@HiltViewModel
class ActiveTrainingViewModel
    @Inject
    constructor(
        repository: TrainingRepository,
    ) : ViewModel() {
        val active: StateFlow<ContinueTraining?> =
            repository.active
                .map { t ->
                    t?.let {
                        ContinueTraining(
                            trainingId = it.id,
                            section = it.session.section,
                            types = it.session.questionTypes,
                            position = it.position,
                            total = it.total,
                        )
                    }
                }.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    }
