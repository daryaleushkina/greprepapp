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
 * Планшет — отдельным классом: смена размера экрана посреди класса телефонных снимков ломала следующие
 * снимки (Robolectric пересоздавал активность, и кадр выходил пустым).
 */
@RunWith(ParameterizedRobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "ru-" + RobolectricDeviceQualifiers.MediumTablet)
class TabletSnapshotTest(
    theme: String,
) : SnapshotBase(theme) {
    @Test
    fun today() = snap("tablet-today") { Today(starter) }

    @Test
    fun signIn() = snap("tablet-signin") { SignIn() }

    @Test
    fun settings() = snap("tablet-settings") { Settings() }

    @Test
    fun trainingBuilder() = snap("tablet-training-builder") { TrainingScreens.Builder() }

    @Test
    fun trainingQuestionWrong() = snap("tablet-training-question-wrong") { TrainingScreens.Session(TrainingScreens.tcWrong) }

    @Test
    fun trainingSummary() = snap("tablet-training-summary") { TrainingScreens.Session(TrainingScreens.summary) }

    @Test
    fun trainingReview() = snap("tablet-training-review") { TrainingScreens.Review() }

    companion object {
        @JvmStatic
        @ParameterizedRobolectricTestRunner.Parameters(name = "{0}")
        fun themes() = listOf(arrayOf("light"), arrayOf("dark"))
    }
}
