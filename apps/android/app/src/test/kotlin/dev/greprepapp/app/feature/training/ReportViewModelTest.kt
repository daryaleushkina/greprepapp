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
    fun withoutOwnerConfirmationTheReportIsPersistedAndWaitsForTheNetwork() =
        runTest(main.dispatcher) {
            val g = TestGraph(this, main.dispatcher, folder.root, token = "token")
            g.ownerReply =
                dev.greprepapp.api.ApiResult
                    .Failed(dev.greprepapp.api.ApiFailure.Offline)
            g.settle()
            val vm = ReportViewModel("q-1", "t-1", g.trainings)
            vm.setKind(QuestionReport.Kind.TRANSLATION)
            vm.setText("test text")
            vm.send()
            g.settle()
            assertEquals(1, g.trainingStore.reports.value.size)
            assertEquals(
                1,
                TrainingStore(folder.root)
                    .also { it.load() }
                    .reports.value.size,
            )
            assertTrue(vm.state.value.sent)
            assertTrue(g.trainingsApi.reports.isEmpty())
            g.ownerReply =
                dev.greprepapp.api.ApiResult
                    .Ok(
                        dev.greprepapp.app.testing
                            .session()
                            .user.id,
                    )
            g.foreground.events.tryEmit(Unit)
            g.settle()
            assertEquals(1, g.trainingsApi.reports.size)
            assertTrue(
                g.trainingStore.reports.value
                    .isEmpty(),
            )
        }

    @Test
    fun failedReportWriteLeavesTheFormAndCanBeRetriedWithoutDuplicates() =
        runTest(main.dispatcher) {
            val g = TestGraph(this, main.dispatcher, folder.root, token = "token")
            g.trainings
            g.settle()
            val blocked = java.io.File(folder.root, "trainings/reports.json.tmp").apply { mkdirs() }
            val vm = ReportViewModel("q-1", "t-1", g.trainings)
            vm.setKind(QuestionReport.Kind.TRANSLATION)
            vm.setText("test text")
            vm.send()
            g.settle()
            assertFalse(vm.state.value.sent)
            assertEquals("test text", vm.state.value.text)
            assertEquals(QuestionReport.Kind.TRANSLATION, vm.state.value.kind)
            assertTrue(vm.state.value.canSend)
            assertTrue(
                g.trainingStore.reports.value
                    .isEmpty(),
            )
            assertTrue(g.publicApi.reports.any { it.message.contains("write failed") })
            blocked.delete()
            vm.send()
            g.settle()
            assertTrue(vm.state.value.sent)
            assertEquals(1, g.trainingsApi.reports.size)
        }

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
