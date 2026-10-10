package dev.greprepapp.app.feature.today

import dev.greprepapp.api.models.Section
import dev.greprepapp.api.models.StepState
import dev.greprepapp.api.models.Today
import dev.greprepapp.design.StudySection
import kotlinx.serialization.Serializable

/** План дня в словах экрана: то, что пришло от сервера, без типов генератора. */
data class TodayPlan(
    val date: String,
    val steps: List<Step>,
) {
    @Serializable
    data class Step(
        val id: String,
        val section: StudySection,
        val title: String,
        val minutes: Int,
        val state: State,
    )

    enum class State { Done, Current, Next }

    val totalMinutes: Int get() = steps.sumOf { it.minutes }
    val isComplete: Boolean get() = steps.isNotEmpty() && steps.all { it.state == State.Done }

    /** Шаг в фокусе: освещён на экране и задаёт цвет света сверху. */
    val current: Step? get() = steps.firstOrNull { it.state == State.Current }

    companion object {
        fun from(dto: Today): TodayPlan =
            TodayPlan(
                date = dto.date,
                steps =
                    dto.steps.map { step ->
                        Step(
                            id = step.id,
                            section = step.section.toStudySection(),
                            title = step.title,
                            minutes = step.minutes,
                            state = step.state.toState(),
                        )
                    },
            )
    }
}

// Новые разделы пока не приходят на экраны GRE; оформление заменит редизайн.
fun Section.toStudySection(): StudySection =
    when (this) {
        Section.VERBAL -> StudySection.Verbal
        Section.QUANT -> StudySection.Quant
        Section.WORDS -> StudySection.Words
        Section.ESSAY, Section.WRITING -> StudySection.Essay
        Section.READING, Section.LISTENING, Section.SPEAKING -> StudySection.Verbal
    }

private fun StepState.toState(): TodayPlan.State =
    when (this) {
        StepState.DONE -> TodayPlan.State.Done
        StepState.CURRENT -> TodayPlan.State.Current
        StepState.NEXT -> TodayPlan.State.Next
    }
