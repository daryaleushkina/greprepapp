package dev.greprepapp.app.feature.training

import dev.greprepapp.api.models.Difficulty
import dev.greprepapp.api.models.QuestionType
import dev.greprepapp.api.models.Section
import dev.greprepapp.api.models.TrainingMode
import dev.greprepapp.api.models.TrainingPreset
import dev.greprepapp.api.models.TrainingRequest
import dev.greprepapp.app.feature.training.BuilderViewModel.Content
import dev.greprepapp.app.testing.Fixtures
import dev.greprepapp.app.testing.MainDispatcherRule
import dev.greprepapp.app.testing.Reply
import dev.greprepapp.app.testing.TestGraph
import kotlinx.coroutines.ExperimentalCoroutinesApi
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

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class BuilderViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    @get:Rule val folder = TemporaryFolder()

    private lateinit var graph: TestGraph

    private fun TestScope.builder(
        prefill: BuilderPrefill? = null,
        presets: List<TrainingPreset> = emptyList(),
    ): BuilderViewModel {
        graph = TestGraph(this, main.dispatcher, folder.root, token = "token-1").also { it.settle() }
        graph.trainingsApi.options = Reply.Ok(Fixtures.options(presets))
        val vm = BuilderViewModel(prefill, graph.trainings)
        advanceUntilIdle()
        return vm
    }

    private val BuilderViewModel.ready get() = state.value.content as Content.Ready

    @Test
    fun everythingIsChosenUpFront() =
        runTest(main.dispatcher) {
            val vm = builder()
            val form = vm.ready.form
            assertEquals(Section.VERBAL, form.section)
            assertEquals(QuestionType.TEXT_COMPLETION, form.type)
            assertEquals(TrainingMode.PRACTICE, form.mode)
            assertNull(vm.ready.preset)
            // Text Completion — 8 заданий: 10 не набрать, уйдёт сколько есть.
            assertEquals(8, BuilderViewModel.requestOf(vm.ready)?.count)
            assertEquals(12, BuilderViewModel.minutes(vm.ready.options, BuilderViewModel.requestOf(vm.ready)!!))
        }

    @Test
    fun lastTrainingIsTheDefaultAndATodayStepWins() =
        runTest(main.dispatcher) {
            val vm =
                builder(
                    presets = listOf(Fixtures.lastPreset, Fixtures.timedPreset, TrainingPreset("weak_topic", Fixtures.lastPreset.request)),
                )
            assertEquals("незнакомый вид набора пропускается", listOf("last", "timed"), vm.ready.presets.map { it.kind })
            assertEquals(0, vm.ready.preset)
            assertEquals(Section.QUANT, vm.ready.form.section)
            assertEquals(TrainingMode.CHECK, vm.ready.form.mode)
            assertEquals(Fixtures.lastPreset.request, BuilderViewModel.requestOf(vm.ready))

            val fromStep = builder(prefill = BuilderPrefill(Section.VERBAL), presets = listOf(Fixtures.lastPreset))
            assertNull(fromStep.ready.preset)
            assertEquals(Section.VERBAL, fromStep.ready.form.section)
        }

    @Test
    fun timedPresetKeepsTheFieldsAndStartsAsIs() =
        runTest(main.dispatcher) {
            val vm = builder(presets = listOf(Fixtures.timedPreset))
            val before = vm.ready.form
            vm.selectPreset(0)
            assertEquals(before, vm.ready.form)
            assertEquals(Fixtures.timedPreset.request, BuilderViewModel.requestOf(vm.ready))
            vm.setCount("5")
            assertNull("правка поля — своя сборка", vm.ready.preset)
        }

    @Test
    fun fieldsFollowTheSection() =
        runTest(main.dispatcher) {
            val vm = builder()
            vm.setSection(Section.QUANT)
            assertEquals(QuestionType.QUANTITATIVE_COMPARISON, vm.ready.form.type)
            vm.setType(QuestionType.MULTIPLE_CHOICE)
            assertNull("типа без заданий не начать", BuilderViewModel.requestOf(vm.ready))
            vm.setCount("1a2")
            assertEquals("12", vm.ready.form.countText)
            vm.setCount("")
            assertNull(vm.ready.form.count)
            vm.setMode(TrainingMode.CHECK)
            assertEquals(TrainingMode.CHECK, vm.ready.form.mode)
        }

    @Test
    fun topicsAndDifficultyNarrowTheCount() =
        runTest(main.dispatcher) {
            val vm = builder()
            vm.openTopics()
            assertTrue(vm.state.value.editingTopics)
            vm.toggleTopic("cause-effect")
            assertEquals(setOf("contrast-signals"), vm.ready.form.topicIds)
            assertEquals(3, BuilderViewModel.available(vm.ready.options, vm.ready.form))
            vm.setDifficulty(Difficulty.MEDIUM)
            assertEquals(2, BuilderViewModel.available(vm.ready.options, vm.ready.form))
            vm.toggleTopic("contrast-signals")
            assertEquals(emptySet<String>(), vm.ready.form.topicIds)
            assertNull("ни одной темы — начать нечего", BuilderViewModel.requestOf(vm.ready))
            vm.toggleTopic("contrast-signals")
            vm.toggleTopic("cause-effect")
            assertNull("снова все темы", vm.ready.form.topicIds)
            vm.closeTopics()
            val request: TrainingRequest = BuilderViewModel.requestOf(vm.ready)!!
            assertEquals(Difficulty.MEDIUM, request.difficulty)
            assertNull(request.topicIds)
        }

    @Test
    fun startGoesToTheTrainingOrSaysWhyNot() =
        runTest(main.dispatcher) {
            val vm = builder()
            graph.trainingsApi.start = Reply.Error(409, "no_questions")
            vm.start()
            advanceUntilIdle()
            assertEquals(StartProblem.NoQuestions, vm.state.value.problem)
            graph.trainingsApi.start = Reply.NetworkDown
            vm.start()
            advanceUntilIdle()
            assertEquals(StartProblem.Offline, vm.state.value.problem)
            graph.trainingsApi.start = Reply.Error(500)
            vm.start()
            advanceUntilIdle()
            assertEquals(StartProblem.Failed, vm.state.value.problem)
            vm.setMode(TrainingMode.PRACTICE)
            assertNull("правка убирает старую ошибку", vm.state.value.problem)

            graph.trainingsApi.start = Reply.Ok(Fixtures.session(Fixtures.tc1))
            vm.start()
            advanceUntilIdle()
            assertEquals(Fixtures.session(Fixtures.tc1).id, vm.state.value.started)
            vm.consumeStarted()
            assertNull(vm.state.value.started)
        }

    @Test
    fun withoutNetworkTheBuilderSaysSoAndRetries() =
        runTest(main.dispatcher) {
            graph = TestGraph(this, main.dispatcher, folder.root, token = "token-1").also { it.settle() }
            graph.trainingsApi.options = Reply.NetworkDown
            val vm = BuilderViewModel(null, graph.trainings)
            advanceUntilIdle()
            assertEquals(Content.Unavailable(TrainingProblem.Offline), vm.state.value.content)
            graph.trainingsApi.options = Reply.Error(500)
            vm.load()
            advanceUntilIdle()
            assertEquals(Content.Unavailable(TrainingProblem.Failed), vm.state.value.content)
            graph.trainingsApi.options = Reply.Ok(Fixtures.options())
            vm.load()
            advanceUntilIdle()
            assertTrue(vm.state.value.content is Content.Ready)
        }
}
