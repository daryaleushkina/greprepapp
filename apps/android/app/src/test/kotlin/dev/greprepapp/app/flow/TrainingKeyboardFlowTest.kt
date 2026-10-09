package dev.greprepapp.app.flow

import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.InputMode
import androidx.compose.ui.input.InputModeManager
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.LocalInputModeManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.pressKey
import dev.greprepapp.app.feature.training.TrainingKeyboard
import dev.greprepapp.design.GpTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "ru-w1000dp-h800dp-land-mdpi-keysexposed-qwerty")
class TrainingKeyboardFlowTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun focusedMaterialButtonReceivesEnterBeforeTheScreenShortcut() {
        val focus = FocusRequester()
        lateinit var input: InputModeManager
        var screenActions = 0
        var buttonActions = 0
        compose.setContent {
            input = LocalInputModeManager.current
            GpTheme {
                TrainingKeyboard(onKey = { key ->
                    if (key == Key.Enter) {
                        screenActions++
                        true
                    } else {
                        false
                    }
                }) {
                    Button(onClick = { buttonActions++ }, modifier = Modifier.focusRequester(focus).testTag("focused")) { Text("Кнопка") }
                }
            }
        }
        compose.runOnIdle {
            input.requestInputMode(InputMode.Keyboard)
            focus.requestFocus()
        }
        compose.onNodeWithTag("focused").assertIsFocused()
        compose.onRoot().performKeyInput { pressKey(Key.Enter) }
        assertEquals(1, buttonActions)
        assertEquals(0, screenActions)
    }
}
