package dev.greprepapp.app.snapshots

import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import com.github.takahirom.roborazzi.captureRoboImage
import dev.greprepapp.app.core.session.SignOutReason
import dev.greprepapp.app.feature.shell.AppTab
import dev.greprepapp.app.feature.shell.MainScaffold
import dev.greprepapp.app.feature.shell.SettingsScreen
import dev.greprepapp.app.feature.shell.StepPlaceholderScreen
import dev.greprepapp.app.feature.signin.SignInContent
import dev.greprepapp.app.feature.signin.SignInViewModel
import dev.greprepapp.app.feature.today.TodayContent
import dev.greprepapp.app.feature.today.TodayPlan
import dev.greprepapp.app.feature.today.TodayViewModel.Content
import dev.greprepapp.app.feature.today.TodayViewModel.UiState
import dev.greprepapp.app.testing.starterPlan
import dev.greprepapp.design.GpTheme
import org.junit.Rule

/** Общее для снимков: съёмка через правило Compose, экраны входа и «Сегодня» с готовым состоянием. */
abstract class SnapshotBase(
    private val theme: String,
) {
    @get:Rule val compose = createComposeRule()

    /**
     * Снять экран. Часы Compose стоят — крутилка загрузки и пульсация не делают кадр каждый раз другим.
     *
     * Robolectric изредка отдаёт кадр, в котором окно ещё не нарисовано (однотонный фон активности): так было
     * с экраном входа в длинной серии снимков, хотя сам экран в тех же условиях на месте (SignInLargeFontTest,
     * сценарии AppFlowTest). Такой кадр не принимается: экран собирается заново, до трёх попыток; пустой и
     * после них — тест падает, а не записывает пустой эталон.
     */
    protected fun snap(
        name: String,
        large: Boolean = false,
        systemFontScale: Float = 1f,
        content: @Composable () -> Unit,
    ) {
        var attempt by mutableIntStateOf(0)
        compose.mainClock.autoAdvance = false
        compose.setContent {
            // Системный масштаб шрифта — через LocalDensity, а не RuntimeEnvironment.setFontScale: тот меняет
            // конфигурацию всего процесса и задевает следующие тесты.
            val density = LocalDensity.current
            key(attempt) {
                CompositionLocalProvider(LocalDensity provides Density(density.density, systemFontScale)) {
                    GpTheme(darkTheme = theme == "dark", largeText = large) { content() }
                }
            }
        }
        repeat(ATTEMPTS) {
            compose.mainClock.advanceTimeBy(FRAME_TIME)
            compose.waitForIdle()
            val frame = compose.onRoot().captureToImage().asAndroidBitmap()
            if (!frame.isSingleColor()) {
                frame.captureRoboImage("src/test/snapshots/$name-$theme.png")
                return
            }
            attempt++
        }
        error("$name-$theme: окно так и не нарисовалось за $ATTEMPTS попытки")
    }

    @Composable
    protected fun SignIn(
        state: SignInViewModel.UiState = SignInViewModel.UiState(),
        reason: SignOutReason? = null,
    ) = SignInContent(state, reason, showsDevelopmentSignIn = false, onProvider = {}, onDevelopment = {})

    @Composable
    protected fun Today(
        state: UiState,
        tab: AppTab = AppTab.Today,
    ) = MainScaffold(appVersion = "0.1.0 (1)", onSignOut = {}, initialTab = tab) {
        TodayContent(state = state, onRefresh = {}, onSelect = {})
    }

    @Composable
    protected fun Settings() = SettingsScreen(appVersion = "0.1.0 (1)", onSignOut = {}, onBack = {})

    @Composable
    protected fun Step() = StepPlaceholderScreen(step = TodayPlan.from(starterPlan).steps[1], onBack = {})

    protected val starter = UiState(content = Content.Plan(TodayPlan.from(starterPlan)))

    private fun Bitmap.isSingleColor(): Boolean {
        val first = getPixel(0, 0)
        val step = SAMPLE_STEP
        for (y in 0 until height step step) {
            for (x in 0 until width step step) {
                if (getPixel(x, y) != first) return false
            }
        }
        return true
    }

    protected companion object {
        const val FRAME_TIME = 300L
        const val ATTEMPTS = 3
        const val SAMPLE_STEP = 16
    }
}
