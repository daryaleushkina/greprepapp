package dev.greprepapp.app.flow

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import dev.greprepapp.app.R
import dev.greprepapp.app.feature.training.BuilderActions
import dev.greprepapp.app.feature.training.BuilderContent
import dev.greprepapp.app.feature.training.StartProblem
import dev.greprepapp.app.feature.training.startProblemText
import dev.greprepapp.app.snapshots.TrainingScreens
import dev.greprepapp.app.ui.StatusLine
import dev.greprepapp.design.GpTheme
import greprep.design.GpSpace
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Сравниваем форму значка, без зависимости от прозрачности фона и эталонов других экранов. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "ru-w1000dp-h800dp-land-mdpi-keyshidden-nokeys")
class BuilderStatusFlowTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun wideBuilderUsesTheNoNetworkIconForAnOfflineStart() {
        val reference = mutableStateOf(false)
        compose.setContent {
            GpTheme(darkTheme = false) {
                if (reference.value) {
                    StatusLine(R.drawable.ic_wifi_off, startProblemText(StartProblem.Offline), Modifier.testTag("reference"))
                } else {
                    BuilderContent(TrainingScreens.builderCustom.copy(problem = StartProblem.Offline), BuilderActions())
                }
            }
        }
        val actualImage = compose.onNodeWithTag("builder.problem").captureToImage()
        val actual = actualImage.toPixelMap()
        compose.runOnIdle { reference.value = true }
        val expectedImage = compose.onNodeWithTag("reference").captureToImage()
        val expected = expectedImage.toPixelMap()
        val side = GpSpace.s20.value.toInt()

        fun shape(pixels: androidx.compose.ui.graphics.PixelMap): List<Boolean> {
            val red = (0 until side).flatMap { y -> (0 until side).map { x -> pixels[x, y].red } }
            val background = pixels[0, 0].red
            val foreground = red.min()
            // Подложки различаются: сравниваем покрытие пикселя значком, а не абсолютную яркость.
            return red.map { (background - it) / (background - foreground) > 0.5f }
        }
        val actualShape = shape(actual)
        val expectedShape = shape(expected)
        assertEquals(expectedShape, actualShape)
    }
}
