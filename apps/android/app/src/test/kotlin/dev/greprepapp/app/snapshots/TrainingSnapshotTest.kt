package dev.greprepapp.app.snapshots

import com.github.takahirom.roborazzi.RobolectricDeviceQualifiers
import dev.greprepapp.api.models.QuestionType
import dev.greprepapp.api.models.Section
import dev.greprepapp.app.feature.shell.MainScaffold
import dev.greprepapp.app.feature.today.TodayContent
import dev.greprepapp.app.feature.training.ContinueTraining
import dev.greprepapp.app.snapshots.TrainingScreens.Session
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Снимки тренировки на телефоне в обеих темах (макеты R1–R17); как записать и сверить — ScreenSnapshotTest. */
@RunWith(ParameterizedRobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "ru-" + RobolectricDeviceQualifiers.MediumPhone)
class TrainingSnapshotTest(
    theme: String,
) : SnapshotBase(theme) {
    @Test
    fun builder() = snap("training-builder") { TrainingScreens.Builder() }

    @Test
    fun builderCustom() = snap("training-builder-custom") { TrainingScreens.Builder(TrainingScreens.builderCustom) }

    @Test
    fun builderOffline() = snap("training-builder-offline") { TrainingScreens.Builder(TrainingScreens.builderOffline) }

    @Test
    fun topics() = snap("training-topics") { TrainingScreens.Builder(TrainingScreens.topics) }

    @Test
    fun questionSelected() = snap("training-question-selected") { Session(TrainingScreens.tcSelected) }

    @Test
    fun questionWrong() = snap("training-question-wrong") { Session(TrainingScreens.tcWrong) }

    @Test
    fun questionThreeBlanks() = snap("training-question-three-blanks") { Session(TrainingScreens.tc3Partial) }

    @Test
    fun questionEquivalenceCorrect() = snap("training-question-se-correct") { Session(TrainingScreens.seCorrect) }

    @Test
    fun questionTimed() = snap("training-question-timed") { Session(TrainingScreens.qcTimed) }

    @Test
    fun overview() = snap("training-overview") { Session(TrainingScreens.overview) }

    @Test
    fun summary() = snap("training-summary") { Session(TrainingScreens.summary) }

    @Test
    fun summaryPerfect() = snap("training-summary-perfect") { Session(TrainingScreens.summaryPerfect) }

    @Test
    fun summaryTimedOut() = snap("training-summary-timed-out") { Session(TrainingScreens.summaryTimedOut) }

    @Test
    fun review() = snap("training-review") { TrainingScreens.Review() }

    @Test
    fun reviewItem() = snap("training-review-item") { TrainingScreens.ReviewItem() }

    @Test
    fun report() = snap("training-report") { TrainingScreens.Report() }

    @Test
    fun reportSent() = snap("training-report-sent") { TrainingScreens.Report(sent = true) }

    @Test
    fun sessionMissing() =
        snap("training-session-missing") { Session(dev.greprepapp.app.feature.training.SessionViewModel.UiState.Missing) }

    @Test
    fun builderNoQuestions() = snap("training-builder-no-questions") { TrainingScreens.Builder(TrainingScreens.builderNoQuestions) }

    @Test
    fun questionWrongLargeText() = snap("training-question-wrong-large", large = true) { Session(TrainingScreens.tcWrong) }

    @Test
    fun builderFontScale130() = snap("training-builder-font-130", systemFontScale = 1.3f) { TrainingScreens.Builder() }

    @Test
    fun todayWithStartedTraining() =
        snap("today-continue") {
            MainScaffold(appVersion = "0.1.0 (1)", onSignOut = {}) {
                TodayContent(
                    state = starter,
                    onRefresh = {},
                    onSelect = {},
                    continueTraining =
                        ContinueTraining("t", Section.VERBAL, listOf(QuestionType.TEXT_COMPLETION), position = 3, total = 10),
                )
            }
        }

    companion object {
        @JvmStatic
        @ParameterizedRobolectricTestRunner.Parameters(name = "{0}")
        fun themes() = listOf(arrayOf("light"), arrayOf("dark"))
    }
}
