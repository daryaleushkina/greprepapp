package dev.greprepapp.app.snapshots

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import com.github.takahirom.roborazzi.RobolectricDeviceQualifiers
import com.github.takahirom.roborazzi.captureRoboImage
import dev.greprepapp.api.models.Section
import dev.greprepapp.api.models.StepState
import dev.greprepapp.app.core.session.SignOutReason
import dev.greprepapp.app.feature.shell.AppTab
import dev.greprepapp.app.feature.shell.MainScaffold
import dev.greprepapp.app.feature.signin.SignInContent
import dev.greprepapp.app.feature.signin.SignInViewModel
import dev.greprepapp.app.feature.signin.SignInViewModel.Message
import dev.greprepapp.app.feature.signin.SignInViewModel.Method
import dev.greprepapp.app.feature.today.TodayContent
import dev.greprepapp.app.feature.today.TodayPlan
import dev.greprepapp.app.feature.today.TodayViewModel.Content
import dev.greprepapp.app.feature.today.TodayViewModel.Problem
import dev.greprepapp.app.feature.today.TodayViewModel.UiState
import dev.greprepapp.app.testing.plan
import dev.greprepapp.app.testing.starterPlan
import dev.greprepapp.app.testing.step
import dev.greprepapp.design.GpTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Эталонные снимки экранов: телефон и планшет, светлая и тёмная тема, «Крупнее» и системный крупный шрифт.
 * Записать — `./gradlew :app:recordRoborazziDebug`, сверить — `verifyRoborazziDebug` (это делает гейт).
 * Переснимать только при намеренной правке вида — и написать об этом в коммите (CLAUDE.md, «Тесты»).
 *
 * Снимок — через правило Compose: кадр снимается, когда содержимое отрисовано и всё затихло. Часы Compose
 * стоят — крутилка загрузки и пульсация не делают кадр каждый раз другим.
 */
@RunWith(ParameterizedRobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "ru-" + RobolectricDeviceQualifiers.MediumPhone)
class ScreenSnapshotTest(
    theme: String,
) : SnapshotBase(theme) {
    @Test
    fun signIn() = snap("signin") { SignIn() }

    @Test
    fun signInExpiredWithMessage() =
        snap("signin-expired-message") {
            SignIn(SignInViewModel.UiState(message = Message.NotConnectedYet(Method.Telegram)), SignOutReason.SessionExpired)
        }

    @Test
    fun signInFailed() = snap("signin-failed") { SignIn(SignInViewModel.UiState(message = Message.Failed)) }

    @Test
    fun today() = snap("today") { Today(starter) }

    @Test
    fun todayLoading() = snap("today-loading") { Today(UiState()) }

    @Test
    fun todayOfflineStale() = snap("today-offline-stale") { Today(starter.copy(stale = Problem.Offline)) }

    @Test
    fun todayFailedStale() = snap("today-failed-stale") { Today(starter.copy(stale = Problem.Failed)) }

    @Test
    fun todayOfflineEmpty() = snap("today-offline-empty") { Today(UiState(content = Content.Unavailable(Problem.Offline))) }

    @Test
    fun todayFailedEmpty() = snap("today-failed-empty") { Today(UiState(content = Content.Unavailable(Problem.Failed))) }

    @Test
    fun todayNeedsNetwork() = snap("today-needs-network") { Today(starter.copy(blockedStepId = "words")) }

    @Test
    fun todayComplete() =
        snap("today-complete") {
            val done =
                plan(
                    step("w", Section.WORDS, StepState.DONE, 5, "Слова: повторение"),
                    step("v", Section.VERBAL, StepState.DONE, 12, "Verbal: Text Completion"),
                )
            Today(UiState(content = Content.Plan(TodayPlan.from(done))))
        }

    @Test
    fun todayLargeText() = snap("today-large-text", large = true) { Today(starter) }

    @Test
    fun todayEightStepsWithSystemFontScale() {
        val eight =
            plan(
                step("1", Section.WORDS, StepState.DONE, 5, "Слова: повторение"),
                step("2", Section.VERBAL, StepState.CURRENT, 10, "Verbal: Text Completion"),
                step("3", Section.QUANT, StepState.NEXT, 10, "Quant: Quantitative Comparison"),
                step("4", Section.VERBAL, StepState.NEXT, 8, "Verbal: Sentence Equivalence"),
                step("5", Section.QUANT, StepState.NEXT, 12, "Quant: Data Interpretation"),
                step("6", Section.WORDS, StepState.NEXT, 5, "Слова: новые"),
                step("7", Section.ESSAY, StepState.NEXT, 30, "Эссе: Analyze an Issue"),
                step("8", Section.VERBAL, StepState.NEXT, 10, "Verbal: Reading Comprehension"),
            )
        snap("today-eight-steps-font-130", large = true, systemFontScale = SYSTEM_FONT_SCALE) {
            Today(UiState(content = Content.Plan(TodayPlan.from(eight))))
        }
    }

    @Test
    fun words() = snap("words") { Today(starter, tab = AppTab.Words) }

    @Test
    fun exam() = snap("exam") { Today(starter, tab = AppTab.Exam) }

    @Test
    fun progress() = snap("progress") { Today(starter, tab = AppTab.Progress) }

    @Test
    fun settings() = snap("settings") { Settings() }

    @Test
    fun step() = snap("step") { Step() }

    companion object {
        private const val SYSTEM_FONT_SCALE = 1.3f

        @JvmStatic
        @ParameterizedRobolectricTestRunner.Parameters(name = "{0}")
        fun themes() = listOf(arrayOf("light"), arrayOf("dark"))
    }
}
