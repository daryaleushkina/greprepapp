package dev.greprepapp.app.feature.training

import androidx.lifecycle.viewModelScope
import dev.greprepapp.api.models.TrainingMode
import dev.greprepapp.app.feature.training.SessionViewModel.UiState
import dev.greprepapp.app.testing.Fixtures
import dev.greprepapp.app.testing.MainDispatcherRule
import dev.greprepapp.app.testing.Reply
import dev.greprepapp.app.testing.TestGraph
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class SessionViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    @get:Rule val folder = TemporaryFolder()

    private lateinit var graph: TestGraph

    private suspend fun TestScope.open(
        mode: TrainingMode = TrainingMode.PRACTICE,
        vararg questions: dev.greprepapp.api.models.Question = arrayOf(Fixtures.tc1, Fixtures.se),
    ): SessionViewModel {
        graph = TestGraph(this, main.dispatcher, folder.root, token = "token-1").also { it.settle() }
        graph.trainingsApi.start = Reply.Ok(Fixtures.session(*questions, mode = mode))
        val id = (graph.trainings.start(Fixtures.timedPreset.request) as StartResult.Started).trainingId
        val vm = SessionViewModel(id, graph.trainings, graph.clock, graph.ticker)
        advanceUntilIdle()
        return vm
    }

    private val SessionViewModel.screen get() = (state.value as UiState.Active).screen

    @Test
    fun practiceChecksThenExplainsThenMovesOn() =
        runTest(main.dispatcher) {
            val vm = open()
            vm.select("C")
            advanceUntilIdle()
            assertEquals(listOf("C"), vm.screen.selection)
            assertTrue(vm.screen.canCheck)
            assertFalse(vm.screen.revealed)
            assertNull("в «Практике» выбор не сохраняется до «Проверить»", vm.screen.training.answer(0))

            vm.check()
            advanceUntilIdle()
            assertTrue(vm.screen.revealed)
            assertEquals(
                listOf("C"),
                vm.screen.training
                    .answer(0)
                    ?.optionIds,
            )
            vm.select("A")
            advanceUntilIdle()
            assertEquals(
                "после разбора ответ не меняется",
                listOf("C"),
                vm.screen.training
                    .answer(0)
                    ?.optionIds,
            )

            vm.toggleWhyNot()
            vm.setEnglish(true)
            advanceUntilIdle()
            assertTrue(vm.screen.whyNotOpen)
            assertEquals(true, vm.screen.english)

            vm.next()
            advanceUntilIdle()
            assertEquals(1, vm.screen.position)
            assertFalse("второй уровень разбора закрывается на новом вопросе", vm.screen.whyNotOpen)
            assertEquals("где остановился — на устройстве", 1, graph.trainingStore.get(vm.screen.training.id)?.position)

            vm.select("A")
            advanceUntilIdle()
            assertFalse("Sentence Equivalence — нужно два слова", vm.screen.canCheck)
            vm.check()
            advanceUntilIdle()
            assertFalse(vm.screen.revealed)
            vm.select("C")
            vm.check()
            advanceUntilIdle()
            vm.next()
            advanceUntilIdle()
            val result = vm.screen.result
            assertNotNull("последний «Дальше» — итог", result)
            assertEquals(1, result!!.correct)
            assertEquals(listOf("contrast-signals"), result.review.map { it.topicId })
        }

    @Test
    fun dontKnowShowsTheExplanationAndCountsAsAMistake() =
        runTest(main.dispatcher) {
            val vm = open()
            vm.select("B")
            vm.dontKnow()
            advanceUntilIdle()
            assertTrue(vm.screen.revealed)
            val answer = vm.screen.training.answer(0)!!
            assertTrue(answer.dontKnow)
            assertTrue(answer.optionIds.isEmpty())
        }

    @Test
    fun checkSavesEachChoiceAndEndsOnTheList() =
        runTest(main.dispatcher) {
            val vm = open(TrainingMode.CHECK)
            assertEquals(2 * 90, vm.screen.remainingSeconds)
            vm.select("B")
            advanceUntilIdle()
            assertEquals(
                "«Проверка» сохраняет выбор сразу",
                listOf("B"),
                vm.screen.training
                    .answer(0)
                    ?.optionIds,
            )
            vm.toggleFlag()
            advanceUntilIdle()
            assertTrue(vm.screen.flagged)
            vm.next()
            advanceUntilIdle()
            assertEquals(
                listOf("B"),
                vm.screen.training
                    .answer(0)
                    ?.optionIds,
            )
            vm.next()
            advanceUntilIdle()
            assertTrue("после последнего — список вопросов", vm.screen.overview)
            vm.goTo(0)
            advanceUntilIdle()
            assertEquals(listOf("B"), vm.screen.selection)
            vm.previous()
            vm.openOverview()
            vm.finish()
            advanceUntilIdle()
            assertNotNull(vm.screen.result)
            assertEquals(
                false,
                vm.screen.training.finish
                    ?.timedOut,
            )
        }

    @Test
    fun anAnswerSurvivesClosingTheScreenRightAway() =
        runTest(main.dispatcher) {
            val vm = open(TrainingMode.CHECK)
            val id = vm.screen.training.id
            vm.select("B")
            // Человек нажал «Закрыть» сразу после выбора: модель экрана уходит вместе с ним.
            vm.viewModelScope.cancel()
            advanceUntilIdle()
            assertEquals(
                listOf("B"),
                graph.trainingStore
                    .get(id)
                    ?.answer(0)
                    ?.optionIds,
            )
        }

    @Test
    fun aQuickFlagThenChoiceKeepsTheFlag() =
        runTest(main.dispatcher) {
            val vm = open(TrainingMode.CHECK)
            vm.toggleFlag()
            vm.select("B")
            advanceUntilIdle()
            val answer = vm.screen.training.answer(0)!!
            assertTrue("отметка не сбросилась выбором", answer.flagged)
            assertEquals(listOf("B"), answer.optionIds)
            vm.toggleFlag()
            vm.toggleFlag()
            advanceUntilIdle()
            assertTrue(
                "двойное нажатие — снять и поставить, а не дважды поставить",
                vm.screen.training
                    .answer(0)!!
                    .flagged,
            )
        }

    @Test
    fun practiceCannotMoveOnBeforeTheAnswerIsChecked() =
        runTest(main.dispatcher) {
            val vm = open()
            vm.next()
            advanceUntilIdle()
            assertEquals(0, vm.screen.position)
            assertNull(vm.screen.result)
        }

    @Test
    fun checkEndsByItselfWhenTimeRunsOut() =
        runTest(main.dispatcher) {
            val vm = open(TrainingMode.CHECK)
            graph.clock.now = graph.clock.now.plusSeconds(2L * 90 + 1)
            graph.ticker.tick()
            advanceUntilIdle()
            assertEquals(0, vm.screen.remainingSeconds)
            assertEquals(
                true,
                vm.screen.training.finish
                    ?.timedOut,
            )
            assertNotNull(vm.screen.result)
        }

    @Test
    fun reopeningContinuesFromTheSameQuestion() =
        runTest(main.dispatcher) {
            val first = open()
            first.select("A")
            first.check()
            advanceUntilIdle()
            first.next()
            advanceUntilIdle()
            val again = SessionViewModel(first.screen.training.id, graph.trainings, graph.clock, graph.ticker)
            advanceUntilIdle()
            assertEquals(1, again.screen.position)
            assertFalse(again.screen.revealed)
        }

    @Test
    fun repeatStartsPracticeOnTheTopicsToReview() =
        runTest(main.dispatcher) {
            val vm = open()
            vm.dontKnow()
            advanceUntilIdle()
            vm.next()
            vm.dontKnow()
            advanceUntilIdle()
            vm.next()
            advanceUntilIdle()
            graph.trainingsApi.start = Reply.Ok(Fixtures.session(Fixtures.tc1, id = "repeat"))
            vm.repeatMistakes()
            advanceUntilIdle()
            val request = graph.trainingsApi.starts.last()
            assertEquals(TrainingMode.PRACTICE, request.mode)
            assertEquals(listOf("contrast-signals", "close-synonyms"), request.topicIds)
            assertEquals(5, request.count)
            assertEquals("repeat", vm.repeat.value.started)
            vm.consumeRepeat()
            assertNull(vm.repeat.value.started)

            graph.trainingsApi.start = Reply.NetworkDown
            vm.repeatMistakes()
            advanceUntilIdle()
            assertEquals(StartProblem.Offline, vm.repeat.value.problem)
        }

    @Test
    fun missingTrainingSaysSo() =
        runTest(main.dispatcher) {
            graph = TestGraph(this, main.dispatcher, folder.root, token = "token-1").also { it.settle() }
            val vm = SessionViewModel("gone", graph.trainings, graph.clock, graph.ticker)
            advanceUntilIdle()
            assertEquals(UiState.Missing, vm.state.value)
        }
}
