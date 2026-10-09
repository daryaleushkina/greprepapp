package dev.greprepapp.app.flow

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import dev.greprepapp.app.feature.training.revealReviewRow
import dev.greprepapp.design.GpTheme
import greprep.design.GpSize
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Проверка геометрии без побочной прокрутки, которую вызывает переход фокуса в режим клавиатуры. */
@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "ru-w1000dp-h800dp-land-mdpi-keyshidden-nokeys")
class ReviewScrollFlowTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun rowBelowTheViewportAppearsAtTheBottomInsteadOfTheTop() {
        lateinit var state: LazyListState
        lateinit var scope: CoroutineScope
        compose.setContent {
            state = rememberLazyListState()
            scope = rememberCoroutineScope()
            GpTheme {
                LazyColumn(state = state, modifier = Modifier.fillMaxSize().testTag("list")) {
                    items((0 until 40).toList(), key = { it }) { index ->
                        Text("Вопрос ${index + 1}", modifier = Modifier.fillMaxWidth().height(GpSize.rowTall).testTag("row.$index"))
                    }
                }
            }
        }
        compose.runOnIdle { scope.launch { revealReviewRow(state, 20, 40) } }
        compose.waitUntilAtLeastOneExists(hasTestTag("row.20"), 10_000)
        compose.waitForIdle()
        val viewport = compose.onNodeWithTag("list").fetchSemanticsNode().boundsInRoot
        val row = compose.onNodeWithTag("row.20").fetchSemanticsNode().boundsInRoot
        assertEquals(viewport.bottom, row.bottom, 1f)
    }
}
