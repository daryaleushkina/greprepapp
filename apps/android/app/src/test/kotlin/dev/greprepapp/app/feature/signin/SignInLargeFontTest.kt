package dev.greprepapp.app.feature.signin

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Density
import com.github.takahirom.roborazzi.RobolectricDeviceQualifiers
import dev.greprepapp.design.GpTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Экран входа с крупным системным шрифтом: всё на месте, нижние кнопки доступны прокруткой. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "ru-" + RobolectricDeviceQualifiers.MediumPhone)
class SignInLargeFontTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun everythingIsReachableWithLargeSystemFont() {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, LARGE_SYSTEM_FONT)) {
                GpTheme(largeText = true) {
                    SignInContent(SignInViewModel.UiState(), null, showsDevelopmentSignIn = false, onProvider = {}, onDevelopment = {})
                }
            }
        }
        compose.onNodeWithTag("signin.telegram").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("signin.google").performScrollTo().assertIsDisplayed()
    }

    private companion object {
        const val LARGE_SYSTEM_FONT = 1.3f
    }
}
