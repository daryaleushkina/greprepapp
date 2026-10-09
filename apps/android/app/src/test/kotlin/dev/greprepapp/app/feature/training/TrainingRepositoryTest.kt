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
import kotlinx.coroutines.cancel
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
    fun expiredSessionKeepsAnswersAndReportsUntilTheSamePersonReturns() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            g.trainingsApi.answers = Reply.NetworkDown
            g.trainingsApi.report = Reply.NetworkDown
            g.trainings.answer(id, 0, listOf("A"))
            g.trainings.report(Fixtures.tc1.id, QuestionReport(QuestionReport.Kind.OTHER, "private text", id))
            g.settle()
            g.session.handleUnauthorized((g.session.state.value as SessionState.SignedIn).id)
            g.settle()
            assertEquals(setOf(0), g.trainingStore.get(id)?.unsent)
            assertEquals(1, g.trainingStore.reports.value.size)
            g.trainingsApi.answers = Reply.Ok(Unit)
            g.trainingsApi.report = Reply.Ok(Unit)
            g.session.didSignIn(
                "renewed",
                dev.greprepapp.app.testing
                    .session()
                    .user.id,
            )
            g.settle()
            assertTrue(
                g.trainingStore
                    .get(id)!!
                    .unsent
                    .isEmpty(),
            )
            assertTrue(
                g.trainingStore.reports.value
                    .isEmpty(),
            )
            assertEquals(1, g.trainingsApi.reports.count { it.second.text == "private text" })
        }

    @Test
    fun aPermanentBatchRefusalRetriesEachAnswerAndDropsOnlyTheRejectedOne() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            g.trainingsApi.answers = Reply.NetworkDown
            g.trainings.answer(id, 0, listOf("A"))
            g.trainings.answer(id, 1, listOf("A", "C"))
            g.settle()
            g.trainingsApi.sentAnswers.clear()
            g.trainingsApi.answerReply = { batch ->
                if (batch.answers.size > 1 || batch.answers.single().position == 0) {
                    Reply.Error(422, "invalid_answer")
                } else {
                    Reply.Ok(Unit)
                }
            }
            g.trainings.sync()
            g.settle()
            assertEquals(
                listOf(listOf(0, 1), listOf(0), listOf(1)),
                g.trainingsApi.sentAnswers.map {
                    it.second.answers.map { a ->
                        a.position
                    }
                },
            )
            assertTrue(
                g.trainingStore
                    .get(id)!!
                    .unsent
                    .isEmpty(),
            )
            assertEquals(1, g.publicApi.reports.count { it.message.contains("rejected") })
        }

    @Test
    fun differentPersonLosesOnlyThePreviousQueueAndReportsCounts() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            g.trainingsApi.answers = Reply.NetworkDown
            g.trainingsApi.report = Reply.NetworkDown
            g.trainings.answer(id, 0, listOf("A"))
            g.trainings.answer(id, 1, listOf("A", "C"))
            g.trainings.report(Fixtures.tc1.id, QuestionReport(QuestionReport.Kind.OTHER, "private text", id))
            g.settle()
            g.session.handleUnauthorized((g.session.state.value as SessionState.SignedIn).id)
            g.settle()
            g.session.didSignIn("other-token", "another-owner")
            g.settle()
            assertNull(g.trainingStore.get(id))
            assertTrue(
                g.trainingStore.reports.value
                    .isEmpty(),
            )
            assertTrue(
                g.trainings.trainings.value
                    .isEmpty(),
            )
            val report =
                g.publicApi.reports
                    .single()
                    .message
            assertEquals("training owner changed: lost answers=2 reports=1", report)
            assertTrue(!report.contains("private text") && !report.contains(Fixtures.tc1.id))
            assertNull(TrainingStore(folder.root).get(id))
        }

    @Test
    fun matchingCredentialRestoresTheQueueWithoutAskingTheServer() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            g.trainingsApi.answers = Reply.NetworkDown
            g.trainings.answer(id, 0, listOf("A"))
            g.settle()
            g.appScope.cancel()
            val again = TestGraph(this, main.dispatcher, folder.root, token = "token-1")
            again.trainingsApi.answers = Reply.NetworkDown
            again.trainings
            again.settle()
            assertEquals(0, again.ownerCalls)
            assertEquals(setOf(0), again.trainingStore.get(id)?.unsent)
            assertEquals(
                id,
                again.trainings.active
                    .first()
                    ?.id,
            )
        }

    @Test
    fun tornTokenAndOwnerWriteWaitsForMeAndDiscardsAChangedOwner() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            g.trainingsApi.answers = Reply.NetworkDown
            g.trainings.answer(id, 0, listOf("A"))
            g.settle()
            g.appScope.cancel()
            val again = TestGraph(this, main.dispatcher, folder.root, token = "new-token")
            again.ownerReply =
                dev.greprepapp.api.ApiResult
                    .Failed(dev.greprepapp.api.ApiFailure.Offline)
            again.trainings
            again.settle()
            assertTrue(again.trainingsApi.sentAnswers.isEmpty())
            assertNull(again.trainings.active.first())
            assertEquals(setOf(0), again.trainingStore.get(id)?.unsent)
            again.ownerReply =
                dev.greprepapp.api.ApiResult
                    .Ok("another-owner")
            again.foreground.events.tryEmit(Unit)
            again.settle()
            assertTrue(again.trainingsApi.sentAnswers.isEmpty())
            assertNull(again.trainingStore.get(id))
            assertEquals(
                "training owner changed: lost answers=1 reports=0",
                again.publicApi.reports
                    .single()
                    .message,
            )
        }

    @Test
    fun lateOwnerConfirmationCannotClearTheNewPersonsTraining() =
        runTest(main.dispatcher) {
            val g = TestGraph(this, main.dispatcher, folder.root, token = "token-1")
            val gate = CompletableDeferred<Unit>()
            g.ownerGate = gate
            g.trainings
            g.settle()
            g.session.signOut()
            g.settle()
            g.session.didSignIn("new-token", "another-owner")
            g.trainingsApi.start = Reply.Ok(Fixtures.session(Fixtures.tc1, id = "new-training"))
            val id = g.started()
            gate.complete(Unit)
            g.settle()
            assertEquals(
                id,
                g.trainings.active
                    .first()
                    ?.id,
            )
            assertTrue(g.publicApi.reports.isEmpty())
        }

    @Test
    fun answerSpecificStatusesSplitTheBatchAndKeepTemporarySingleFailures() =
        runTest(main.dispatcher) {
            for (status in listOf(400, 422)) {
                val g = graph()
                val id = g.started()
                g.trainingsApi.answers = Reply.NetworkDown
                g.trainings.answer(id, 0, listOf("A"))
                g.trainings.answer(id, 1, listOf("A", "C"))
                g.settle()
                g.trainingsApi.answerReply = { batch ->
                    if (batch.answers.size > 1 || batch.answers.single().position == 0) {
                        Reply.Error(status, if (status == 400) "bad_request" else "invalid")
                    } else {
                        Reply.Error(429, "later")
                    }
                }
                g.trainings.sync()
                g.settle()
                assertEquals(setOf(1), g.trainingStore.get(id)?.unsent)
                assertEquals(1, g.publicApi.reports.count { it.message.contains("rejected") })
                g.appScope.cancel()
            }
        }

    @Test
    fun ownerConfirmationDoesNotEraseThePlanThatJustArrivedFromTheServer() =
        runTest(main.dispatcher) {
            val g = TestGraph(this, main.dispatcher, folder.root, token = "token-1")
            val gate = CompletableDeferred<Unit>()
            g.ownerGate = gate
            g.trainings
            g.settle()
            g.cache.save(dev.greprepapp.app.testing.starterPlan)
            gate.complete(Unit)
            g.settle()
            org.junit.Assert.assertNotNull(g.cache.load())
        }

    @Test
    fun startingWithoutOwnerAndNetworkReportsOffline() =
        runTest(main.dispatcher) {
            val g = TestGraph(this, main.dispatcher, folder.root, token = "token")
            g.ownerReply =
                dev.greprepapp.api.ApiResult
                    .Failed(dev.greprepapp.api.ApiFailure.Offline)
            g.settle()
            assertEquals(StartResult.Failed(TrainingProblem.Offline), g.trainings.start(request))
            assertTrue(g.trainingsApi.starts.isEmpty())
        }

    @Test
    fun trainingWideRefusalDoesNotSplitTheBatchOrSendTheFinish() =
        runTest(main.dispatcher) {
            for (status in listOf(404, 409, 410)) {
                val g = graph()
                val id = g.started()
                g.trainingsApi.answers = Reply.NetworkDown
                g.trainings.answer(id, 0, listOf("A"))
                g.trainings.answer(id, 1, listOf("A", "C"))
                g.trainings.finish(id, false)
                g.settle()
                g.trainingsApi.sentAnswers.clear()
                g.trainingsApi.answers = Reply.Error(status, "training_unavailable")
                g.trainings.sync()
                g.settle()
                assertEquals(1, g.trainingsApi.sentAnswers.size)
                assertEquals(1, g.publicApi.reports.count { it.message.contains("rejected") })
                assertTrue(g.trainingsApi.finishes.isEmpty())
                assertTrue(g.trainingStore.get(id)!!.isSynced)
                g.appScope.cancel()
            }
        }

    @Test
    fun badRequestSplitsTheBatchAndReportsOnlyTheBadAnswer() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            g.trainingsApi.answers = Reply.NetworkDown
            g.trainings.answer(id, 0, listOf("A"))
            g.trainings.answer(id, 1, listOf("A", "C"))
            g.settle()
            g.trainingsApi.sentAnswers.clear()
            g.trainingsApi.answerReply = { batch ->
                if (batch.answers.size > 1 || batch.answers.single().position == 0) {
                    Reply.Error(400, "bad_request")
                } else {
                    Reply.Ok(Unit)
                }
            }
            g.trainings.sync()
            g.settle()
            assertEquals(listOf(2, 1, 1), g.trainingsApi.sentAnswers.map { it.second.answers.size })
            assertEquals(1, g.publicApi.reports.count { it.message.contains("rejected") })
        }

    @Test
    fun aTrainingThatDisappearsDuringSingleRetriesStopsTheRemainingRequests() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            g.trainingsApi.answers = Reply.NetworkDown
            g.trainings.answer(id, 0, listOf("A"))
            g.trainings.answer(id, 1, listOf("A", "C"))
            g.settle()
            g.trainingsApi.sentAnswers.clear()
            g.trainingsApi.answerReply = { batch ->
                if (batch.answers.size > 1) Reply.Error(422, "invalid_answer") else Reply.Error(404, "not_found")
            }
            g.trainings.sync()
            g.settle()
            assertEquals(2, g.trainingsApi.sentAnswers.size)
            assertEquals(1, g.publicApi.reports.count { it.message.contains("rejected") })
            g.trainings.answer(id, 1, listOf("B", "D"))
            g.trainings.finish(id, false)
            g.settle()
            assertEquals(2, g.trainingsApi.sentAnswers.size)
            assertTrue(g.trainingsApi.finishes.isEmpty())
        }

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
    fun aFullDiskDoesNotStopTheTrainingAndIsReported() =
        runTest(main.dispatcher) {
            // Вместо папки тренировок — файл: записать нельзя, как при полном диске.
            val g = graph()
            File(folder.root, "trainings").deleteRecursively()
            File(folder.root, "trainings").writeText("")
            val id = g.started()
            g.trainings.recordAnswer(id, 0, listOf("A"))
            g.settle()
            assertEquals(
                "в памяти ответ есть, тренировка идёт",
                listOf("A"),
                g.trainingStore.trainings.value[id]
                    ?.answer(0)
                    ?.optionIds,
            )
            assertTrue(g.publicApi.reports.any { it.message.startsWith("training write failed") })
        }

    @Test
    fun afterTheEndNothingChanges() =
        runTest(main.dispatcher) {
            val g = graph()
            val id = g.started()
            g.trainings.finish(id, timedOut = true)
            g.trainings.answer(id, 0, listOf("A"))
            g.trainings.finish(id, timedOut = false)
            g.settle()
            val t = g.trainingStore.get(id)!!
            assertNull("ответ после конца не принимается", t.answer(0))
            assertEquals("«Закончить» после тайм-аута его не отменяет", true, t.finish?.timedOut)
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
