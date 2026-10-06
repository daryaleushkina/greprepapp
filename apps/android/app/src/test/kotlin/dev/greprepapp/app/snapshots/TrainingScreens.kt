package dev.greprepapp.app.snapshots

import androidx.compose.runtime.Composable
import dev.greprepapp.api.models.Difficulty
import dev.greprepapp.api.models.GivenAnswer
import dev.greprepapp.api.models.Question
import dev.greprepapp.api.models.QuestionReport
import dev.greprepapp.api.models.QuestionType
import dev.greprepapp.api.models.Section
import dev.greprepapp.api.models.TrainingFinish
import dev.greprepapp.api.models.TrainingMode
import dev.greprepapp.app.feature.training.BuilderActions
import dev.greprepapp.app.feature.training.BuilderContent
import dev.greprepapp.app.feature.training.BuilderForm
import dev.greprepapp.app.feature.training.BuilderViewModel
import dev.greprepapp.app.feature.training.ReportContent
import dev.greprepapp.app.feature.training.ReportViewModel
import dev.greprepapp.app.feature.training.ReviewContent
import dev.greprepapp.app.feature.training.ReviewItemContent
import dev.greprepapp.app.feature.training.ReviewViewModel
import dev.greprepapp.app.feature.training.SessionActions
import dev.greprepapp.app.feature.training.SessionContent
import dev.greprepapp.app.feature.training.SessionViewModel
import dev.greprepapp.app.feature.training.StoredTraining
import dev.greprepapp.app.feature.training.TrainingProblem
import dev.greprepapp.app.feature.training.TrainingRules
import dev.greprepapp.app.testing.Fixtures
import dev.greprepapp.app.testing.Fixtures.qc
import dev.greprepapp.app.testing.Fixtures.se
import dev.greprepapp.app.testing.Fixtures.tc1
import dev.greprepapp.app.testing.Fixtures.tc3
import java.time.Instant

/** Готовые состояния экранов тренировки для снимков: телефон, планшет, крупный шрифт. */
object TrainingScreens {
    private val start = Instant.parse("2026-10-06T09:00:00Z").toEpochMilli()

    private fun answer(
        position: Int,
        vararg ids: String,
        flagged: Boolean = false,
        dontKnow: Boolean = false,
    ) = GivenAnswer(position, ids.toList(), dontKnow, flagged, "2026-10-06T09:02:00Z", 30_000)

    fun stored(
        vararg questions: Question,
        mode: TrainingMode = TrainingMode.PRACTICE,
        answers: List<GivenAnswer> = emptyList(),
        finish: TrainingFinish? = null,
    ) = StoredTraining(
        session = Fixtures.session(*questions, mode = mode),
        startedAtMillis = start,
        answers = answers.associateBy { it.position },
        finish = finish,
    )

    private fun active(
        t: StoredTraining,
        position: Int = 0,
        selection: List<String> = emptyList(),
        remaining: Int? = null,
        overview: Boolean = false,
        english: Boolean? = null,
        whyNot: Boolean = false,
    ) = SessionViewModel.UiState.Active(SessionViewModel.Screen(t, position, selection, remaining, overview, english, whyNot))

    @Composable
    fun Session(state: SessionViewModel.UiState) = SessionContent(state, SessionViewModel.RepeatState(), SessionActions())

    /** Text Completion до проверки, выбран вариант C; позади — один верный ответ (точка цвета раздела). */
    val tcSelected = active(stored(se, tc1, tc3, answers = listOf(answer(0, "A", "C"))), position = 1, selection = listOf("C"))

    /** Неверно, разбор с «Почему не exhaustive?» (макет R4). */
    val tcWrong = active(stored(tc1, se, tc3, answers = listOf(answer(0, "C"))), whyNot = true)

    /** Три пропуска, два выбраны — подсказка о третьем (макет R5). */
    val tc3Partial = active(stored(tc3, tc1), selection = listOf("A", "D"))

    /** Sentence Equivalence, верно, разбор по-английски (макет R6). */
    val seCorrect = active(stored(se, tc1, answers = listOf(answer(0, "A", "C"))), english = true)

    /** Quantitative Comparison в «Проверке»: таймер, выбран ответ, вопрос отмечен (макеты R9, R14). */
    val qcTimed =
        active(
            stored(qc, Fixtures.mc, mode = TrainingMode.CHECK, answers = listOf(answer(0, "B", flagged = true))),
            selection = listOf("B"),
            remaining = 760,
        )

    /** Список вопросов «Проверки»: отвеченные, отмеченные, пустые. */
    val overview =
        active(
            stored(
                tc1,
                se,
                tc3,
                tc1,
                se,
                tc3,
                mode = TrainingMode.CHECK,
                answers = listOf(answer(0, "A"), answer(1, "A", "C", flagged = true), answer(3, flagged = true)),
            ),
            position = 5,
            remaining = 312,
            overview = true,
        )

    private val finishedAnswers =
        listOf(answer(0, "C"), answer(1, "A", "C"), answer(2, "B", "D", "G"), answer(3, "A"), answer(4, dontKnow = true))

    /** Итог с «Что повторить» (макет R15). */
    val summary =
        active(stored(tc1, se, tc3, tc1, se, answers = finishedAnswers, finish = TrainingFinish("2026-10-06T09:11:20Z", false)))

    val summaryPerfect =
        active(
            stored(tc1, se, answers = listOf(answer(0, "A"), answer(1, "A", "C")), finish = TrainingFinish("2026-10-06T09:04:00Z", false)),
        )

    val summaryTimedOut =
        active(
            stored(
                qc,
                Fixtures.mc,
                qc,
                mode = TrainingMode.CHECK,
                answers = listOf(answer(0, "B")),
                finish = TrainingFinish("2026-10-06T09:30:00Z", true),
            ),
        )

    private val reviewTraining =
        stored(tc1, se, tc3, tc1, se, answers = finishedAnswers, finish = TrainingFinish("2026-10-06T09:11:20Z", false))

    val review = ReviewViewModel.UiState.Ready(reviewTraining, TrainingRules.result(reviewTraining))

    @Composable
    fun Review() = ReviewContent(review, onBack = {}, onOpen = {})

    @Composable
    fun ReviewItem() = ReviewItemContent(review, position = 0, onBack = {}, onReport = {})

    @Composable
    fun Report(sent: Boolean = false) =
        ReportContent(
            state =
                ReportViewModel.UiState(
                    kind = QuestionReport.Kind.TRANSLATION,
                    text = "В английском разборе опечатка: «recomendation».",
                    sent = sent,
                ),
            position = 3,
            typeLabel = "Text Completion",
            onKind = {},
            onText = {},
            onSend = {},
            onBack = {},
        )

    private val readyBuilder =
        BuilderViewModel.Content.Ready(
            options = Fixtures.options(listOf(Fixtures.lastPreset, Fixtures.timedPreset)),
            form = BuilderForm(Section.QUANT, QuestionType.QUANTITATIVE_COMPARISON, "5", TrainingMode.CHECK, null, null),
            preset = 0,
        )

    @Composable
    fun Builder(state: BuilderViewModel.UiState = BuilderViewModel.UiState(content = readyBuilder)) =
        BuilderContent(state, BuilderActions())

    val builderCustom =
        BuilderViewModel.UiState(
            content =
                readyBuilder.copy(
                    form =
                        BuilderForm(
                            Section.VERBAL,
                            QuestionType.TEXT_COMPLETION,
                            "10",
                            TrainingMode.PRACTICE,
                            setOf("contrast-signals"),
                            null,
                        ),
                    preset = null,
                ),
        )

    /** «Под этот выбор заданий пока нет» после «Начать». */
    val builderNoQuestions = builderCustom.copy(problem = dev.greprepapp.app.feature.training.StartProblem.NoQuestions)

    val builderOffline = BuilderViewModel.UiState(content = BuilderViewModel.Content.Unavailable(TrainingProblem.Offline))

    val topics =
        BuilderViewModel.UiState(
            content =
                readyBuilder.copy(
                    form =
                        BuilderForm(
                            Section.VERBAL,
                            QuestionType.TEXT_COMPLETION,
                            "10",
                            TrainingMode.PRACTICE,
                            setOf("cause-effect"),
                            Difficulty.MEDIUM,
                        ),
                    preset = null,
                ),
            editingTopics = true,
        )
}
