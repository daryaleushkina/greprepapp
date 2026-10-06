package dev.greprepapp.app.feature.training

import dev.greprepapp.api.models.QuestionReport
import dev.greprepapp.app.testing.MainDispatcherRule
import dev.greprepapp.app.testing.TestGraph
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class ReportViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    @get:Rule val folder = TemporaryFolder()

    @Test
    fun sendsOnceWithTheTextCutToTheContract() =
        runTest(main.dispatcher) {
            val graph = TestGraph(this, main.dispatcher, folder.root, token = "token-1").also { it.settle() }
            val vm = ReportViewModel("q-1", "t-1", graph.trainings)
            assertFalse("без вида ошибки не отправить", vm.state.value.canSend)
            vm.send()
            vm.setKind(QuestionReport.Kind.TRANSLATION)
            // 2001 эмодзи — 4002 знака UTF-16; договор считает символы Unicode.
            vm.setText("😀".repeat(2001))
            assertEquals(
                2000,
                vm.state.value.text
                    .codePointCount(0, vm.state.value.text.length),
            )
            vm.send()
            vm.send()
            advanceUntilIdle()
            assertTrue(vm.state.value.sent)
            assertEquals("повторное «Отправить» — не вторая жалоба", 1, graph.trainingsApi.reports.size)
            val (question, report) = graph.trainingsApi.reports.single()
            assertEquals("q-1", question)
            assertEquals("t-1", report.trainingId)
        }

    @Test
    fun emptyTextIsNotSent() =
        runTest(main.dispatcher) {
            val graph = TestGraph(this, main.dispatcher, folder.root, token = "token-1").also { it.settle() }
            val vm = ReportViewModel("q-1", "t-1", graph.trainings)
            vm.setKind(QuestionReport.Kind.OTHER)
            vm.setText("   ")
            vm.send()
            advanceUntilIdle()
            assertNull(
                graph.trainingsApi.reports
                    .single()
                    .second.text,
            )
        }
}
