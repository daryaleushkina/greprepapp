package dev.greprepapp.app.feature.signin

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.Density
import com.github.takahirom.roborazzi.RobolectricDeviceQualifiers
import dev.greprepapp.design.GpTheme
import org.junit.Assert.assertFalse
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

    @Test
    fun providerButtonsGrowInsteadOfCuttingTheirLabels() {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, LARGEST_SYSTEM_FONT)) {
                GpTheme(largeText = true) {
                    SignInContent(SignInViewModel.UiState(), null, showsDevelopmentSignIn = false, onProvider = {}, onDevelopment = {})
                }
            }
        }
        for (label in listOf("Войти через Telegram", "Вход с Apple", "Войти с аккаунтом Google")) {
            val results = mutableListOf<TextLayoutResult>()
            compose
                .onNodeWithText(label, useUnmergedTree = true)
                .performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(results) }
            // Обрезка, которую ловит тест, — по высоте: кнопка жёсткой высоты срезала перенесённую подпись.
            // Переполнение по ширине у центрированного текста Compose отмечает и без обрезки — его не смотрим.
            val layout = results.single()
            assertFalse("подпись «$label» обрезана по высоте (строк: ${layout.lineCount})", layout.didOverflowHeight)
        }
    }

    private companion object {
        const val LARGE_SYSTEM_FONT = 1.3f
        const val LARGEST_SYSTEM_FONT = 2f
    }
}
