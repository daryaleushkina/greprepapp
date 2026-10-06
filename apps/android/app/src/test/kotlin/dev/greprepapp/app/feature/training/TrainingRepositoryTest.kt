package dev.greprepapp.app.feature.training

import dev.greprepapp.api.models.QuestionReport
import dev.greprepapp.api.models.QuestionType
import dev.greprepapp.api.models.Section
import dev.greprepapp.api.models.TrainingMode
import dev.greprepapp.api.models.TrainingRequest
import dev.greprepapp.app.core.session.SessionState
import dev.greprepapp.app.core.session.SignOutReason
import dev.greprepapp.app.testing.Fixtures
import dev.greprepapp.app.testing.MainDispatcherRule
import dev.greprepapp.app.testing.Reply
import dev.greprepapp.app.testing.TestGraph
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class TrainingRepositoryTest {
    @get:Rule val main = MainDispatcherRule()

    @get:Rule val folder = TemporaryFolder()

    private val request =
        TrainingRequest(Section.VERBAL, setOf(QuestionType.TEXT_COMPLETION), count = 2, mode = TrainingMode.PRACTICE)

    private fun TestScope.graph(): TestGraph =
        TestGraph(this, main.dispatcher, folder.root, token = "token-1").also {
            it.trainings
            it.settle()
        }

    private suspend fun TestGraph.started(): String = (trainings.start(request) as StartResult.Started).trainingId

    @Test
    fun startKeepsTheWholeSessionOnTheDevice() =
        runTest(main.dispatcher) {
            val g = graph()
            val result = g.trainings.start(request)
            assertTrue(result is StartResult.Started)
            val id = (result as StartResult.Started).trainingId
            val stored = g.trainingStore.get(id)!!
            assertEquals(2, stored.total)
            assertEquals(g.clock.millis(), stored.startedAtMillis)
            assertEquals(listOf(request), g.trainingsApi.starts)
            assertEquals(stored, g.trainings.active.first())
        }

    @Test
    fun anUnreadableTrainingOnTheDeviceIsReported() =
        runTest(main.dispatcher) {
            val dir = File(folder.root, "trainings").apply { mkdirs() }
            File(dir, "old.training.json").writeText("""{"session":{}}""")
            val g = graph()
            g.settle()
            assertTrue(g.publicApi.reports.any { it.message.startsWith("training file unreadable") })
        }

    @Test
    fun optionsNameEveryTypeTheAppCanShow() =
        runTest(main.dispatcher) {
            val g = graph()
            g.trainings.options()
            assertEquals(QuestionType.entries.toList(), g.trainingsApi.optionCalls.single())
        }

    @Test
    fun startFailuresAreToldApart() =
        runTest(main.dispatcher) {
            val g = graph()
            g.trainingsApi.start = Reply.Error(409, "no_questions")
            assertEquals(StartResult.NoQuestions, g.trainings.start(request))
            g.trainingsApi.start = Reply.NetworkDown
            assertEquals(StartResult.Failed(TrainingProblem.Offline), g.trainings.start(request))
            g.trainingsApi.start = Reply.Error(500)
            assertEquals(StartResult.Failed(TrainingProblem.Failed), g.trainings.start(request))
            g.settle()
            assertEquals("наш сбой — в журнал, «нет заданий» и «нет сети» — нет", 1, g.publicApi.reports.size)
            g.trainingsApi.start = Reply.Error(401, "unauthorized")
            g.trainings.start(request)
            g.settle()
            assertEquals(SessionState.SignedOut(SignOutReason.SessionExpired), g.session.state.value)
        }

    @Test
    fun answersGoToTheServerAndLeaveTheQueue() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            g.trainings.answer(id, 0, listOf("A"), elapsedMs = 4000)
            g.settle()
            val (sentId, batch) = g.trainingsApi.sentAnswers.single()
            assertEquals(id, sentId)
            assertEquals(listOf("A"), batch.answers.single().optionIds)
            assertEquals(4000, batch.answers.single().elapsedMs)
            assertTrue(
                g.trainingStore
                    .get(id)!!
                    .unsent
                    .isEmpty(),
            )
        }

    @Test
    fun withoutNetworkAnswersAndTheEndWaitThenGoInOrder() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            g.trainingsApi.answers = Reply.NetworkDown
            g.trainings.answer(id, 0, listOf("A"))
            g.trainings.answer(id, 1, listOf("A", "C"))
            g.trainings.finish(id, timedOut = false)
            g.settle()
            val waiting = g.trainingStore.get(id)!!
            assertEquals(setOf(0, 1), waiting.unsent)
            assertTrue("конец не уходит раньше ответов", g.trainingsApi.finishes.isEmpty())

            g.trainingsApi.answers = Reply.Ok(Unit)
            val attempts = g.trainingsApi.sentAnswers.size
            g.network.isOnline.value = false
            g.settle()
            g.network.isOnline.value = true
            g.settle()
            assertEquals("сеть вернулась — очередь ушла сама", attempts + 1, g.trainingsApi.sentAnswers.size)
            assertEquals(
                listOf(0, 1),
                g.trainingsApi.sentAnswers
                    .last()
                    .second.answers
                    .map { it.position },
            )
            assertEquals(
                id,
                g.trainingsApi.finishes
                    .single()
                    .first,
            )
            assertTrue(g.trainingStore.get(id)!!.isSynced)
        }

    @Test
    fun anAnswerChangedInFlightIsSentAgain() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            val gate = CompletableDeferred<Unit>()
            g.trainingsApi.answersGate = gate
            g.trainings.answer(id, 0, listOf("B"))
            g.settle()
            // Пока первый ответ летит, человек («Проверка») меняет выбор.
            g.clock.now = g.clock.now.plusSeconds(5)
            g.trainings.answer(id, 0, listOf("A"))
            gate.complete(Unit)
            g.settle()
            assertEquals(
                listOf(listOf("B"), listOf("A")),
                g.trainingsApi.sentAnswers.map {
                    it.second.answers
                        .single()
                        .optionIds
                },
            )
            assertTrue(
                g.trainingStore
                    .get(id)!!
                    .unsent
                    .isEmpty(),
            )
        }

    @Test
    fun rejectedAnswersAreReportedAndDoNotBlockTheQueue() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            g.trainingsApi.answers = Reply.Error(400, "bad_request")
            g.trainings.answer(id, 0, listOf("A"))
            g.trainings.finish(id, timedOut = false)
            g.settle()
            assertTrue(g.trainingStore.get(id)!!.isSynced)
            assertEquals("конец всё равно ушёл", 1, g.trainingsApi.finishes.size)
            assertTrue(g.publicApi.reports.any { it.message.contains("rejected: bad_request") })
        }

    @Test
    fun serverFailureKeepsTheQueueForLater() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            g.trainingsApi.answers = Reply.Error(503)
            g.trainings.answer(id, 0, listOf("A"))
            g.settle()
            assertEquals("503 от прокси — «нет сети», ответ ждёт", setOf(0), g.trainingStore.get(id)!!.unsent)
            g.trainingsApi.answers = Reply.Error(500)
            g.foreground.events.tryEmit(Unit)
            g.settle()
            assertEquals(setOf(0), g.trainingStore.get(id)!!.unsent)
            g.trainingsApi.answers = Reply.Ok(Unit)
            g.foreground.events.tryEmit(Unit)
            g.settle()
            assertTrue(
                g.trainingStore
                    .get(id)!!
                    .unsent
                    .isEmpty(),
            )
        }

    @Test
    fun oneBrokenTrainingDoesNotHoldBackTheOthers() =
        runTest(main.dispatcher) {
            val g = graph()
            g.trainingsApi.start = Reply.Ok(Fixtures.session(Fixtures.tc1, id = "old"))
            val old = g.started()
            g.trainingsApi.answersFor[old] = Reply.Error(500)
            g.trainings.answer(old, 0, listOf("A"))
            g.clock.now = g.clock.now.plusSeconds(60)
            g.trainingsApi.start = Reply.Ok(Fixtures.session(Fixtures.tc1, id = "new"))
            val new = g.started()
            g.trainings.answer(new, 0, listOf("A"))
            g.trainings.report(Fixtures.tc1.id, QuestionReport(QuestionReport.Kind.OTHER, trainingId = new))
            g.settle()
            assertEquals("старая ждёт следующего раза", setOf(0), g.trainingStore.get(old)!!.unsent)
            assertTrue(
                "новая ушла",
                g.trainingStore
                    .get(new)!!
                    .unsent
                    .isEmpty(),
            )
            assertTrue(
                "жалобы тоже",
                g.trainingStore.reports.value
                    .isEmpty(),
            )
        }

    @Test
    fun refusalsThatMayPassLaterKeepTheQueue() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            for (status in listOf(403, 408, 429)) {
                g.trainingsApi.answers = Reply.Error(status, "refused")
                g.trainings.answer(id, 0, listOf("A"))
                g.settle()
                assertEquals(
                    "$status — не выбрасывать: подписка вернётся, ограничение снимется",
                    setOf(0),
                    g.trainingStore.get(id)!!.unsent,
                )
            }
        }

    @Test
    fun aCheckWhoseTimeRanOutIsFinishedWithoutTheScreen() =
        runTest(main.dispatcher) {
            val g = graph()
            g.trainingsApi.start = Reply.Ok(Fixtures.session(Fixtures.tc1, Fixtures.se, mode = TrainingMode.CHECK))
            val id = g.started()
            g.clock.now = g.clock.now.plusSeconds(3600)
            g.foreground.events.tryEmit(Unit)
            g.settle()
            val t = g.trainingStore.get(id)!!
            assertEquals(true, t.finish?.timedOut)
            assertTrue("конец ушёл на сервер", t.finishSent)
            assertNull("в «Продолжить» её нет", g.trainings.active.first())
        }

    @Test
    fun anAbandonedTrainingLeavesTheDeviceOnceItsAnswersAreSent() =
        runTest(main.dispatcher) {
            val g = graph()
            g.trainingsApi.start = Reply.Ok(Fixtures.session(Fixtures.tc1, Fixtures.se, id = "abandoned"))
            val abandoned = g.started()
            g.trainings.answer(abandoned, 0, listOf("A"))
            g.clock.now = g.clock.now.plusSeconds(60)
            g.trainingsApi.start = Reply.Ok(Fixtures.session(Fixtures.tc1, id = "current"))
            val current = g.started()
            g.settle()
            assertEquals(
                listOf(abandoned),
                g.trainingsApi.sentAnswers
                    .map { it.first }
                    .distinct(),
            )
            assertNull("брошенная — прочь, когда её ответы дошли", g.trainingStore.get(abandoned))
            assertEquals(
                current,
                g.trainings.active
                    .first()
                    ?.id,
            )
        }

    @Test
    fun finishedTrainingIsNoLongerOfferedToContinue() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            assertEquals(
                id,
                g.trainings.active
                    .first()
                    ?.id,
            )
            g.trainings.finish(id, timedOut = false)
            g.settle()
            assertNull(g.trainings.active.first())
        }

    @Test
    fun reportsWaitForTheNetwork() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            g.trainingsApi.report = Reply.NetworkDown
            g.trainings.report(Fixtures.tc1.id, QuestionReport(QuestionReport.Kind.TRANSLATION, "опечатка", id))
            g.settle()
            assertEquals(1, g.trainingStore.reports.value.size)
            g.trainingsApi.report = Reply.Ok(Unit)
            g.trainings.sync()
            g.settle()
            assertTrue(
                g.trainingStore.reports.value
                    .isEmpty(),
            )
            assertEquals(
                QuestionReport.Kind.TRANSLATION,
                g.trainingsApi.reports
                    .last()
                    .second.kind,
            )
        }

    @Test
    fun signOutWipesTrainingsAndALateAnswerDoesNotBringThemBack() =
        runTest(main.dispatcher) {
            val g = graph()
            val gate = CompletableDeferred<Unit>()
            g.trainingsApi.answersGate = gate
            val id = g.started()
            g.trainings.answer(id, 0, listOf("A"))
            g.settle()
            g.session.signOut()
            g.settle()
            gate.complete(Unit)
            g.settle()
            assertTrue(
                g.trainingStore.trainings.value
                    .isEmpty(),
            )
            assertNull(g.trainingStore.get(id))
        }

    @Test
    fun startWhileSignedOutDoesNothing() =
        runTest(main.dispatcher) {
            val g = TestGraph(this, main.dispatcher, folder.root, token = null).also { it.settle() }
            assertEquals(StartResult.Failed(TrainingProblem.Failed), g.trainings.start(request))
            assertTrue(g.trainingsApi.starts.isEmpty())
        }

    @Test
    fun oldFinishedAndAbandonedTrainingsArePruned() =
        runTest(main.dispatcher) {
            val g = graph()
            val ids =
                (1..5).map { n ->
                    g.trainingsApi.start = Reply.Ok(Fixtures.session(Fixtures.tc1, id = "id-$n"))
                    g.clock.now = g.clock.now.plusSeconds(60)
                    g.started().also { if (n != 3) g.trainings.finish(it, timedOut = false) }
                }
            g.settle()
            // Ещё одна — уборка идёт при начале новой.
            g.trainingsApi.start = Reply.Ok(Fixtures.session(Fixtures.tc1, id = "id-6"))
            g.started()
            g.settle()
            val kept = g.trainingStore.trainings.value.keys
            assertEquals(
                "законченных — три последних; брошенная незаконченная (id-3) — прочь, её ответы уже дошли",
                setOf("id-2", "id-4", "id-5", "id-6"),
                kept,
            )
            assertTrue(ids[2] !in kept)
        }

    @Test
    fun syncDuringSyncRunsAnotherRound() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            val gate = CompletableDeferred<Unit>()
            g.trainingsApi.answersGate = gate
            g.trainings.answer(id, 0, listOf("A"))
            g.settle()
            launch { g.trainings.answer(id, 1, listOf("A", "C")) }
            g.settle()
            gate.complete(Unit)
            g.settle()
            assertEquals(2, g.trainingsApi.sentAnswers.size)
            assertTrue(
                g.trainingStore
                    .get(id)!!
                    .unsent
                    .isEmpty(),
            )
        }
}
