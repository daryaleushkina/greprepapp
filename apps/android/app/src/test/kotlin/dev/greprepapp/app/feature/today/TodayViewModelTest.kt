package dev.greprepapp.app.feature.today

import dev.greprepapp.api.models.Section
import dev.greprepapp.api.models.StepState
import dev.greprepapp.app.core.session.SessionState
import dev.greprepapp.app.core.session.SignOutReason
import dev.greprepapp.app.feature.today.TodayViewModel.Content
import dev.greprepapp.app.feature.today.TodayViewModel.Problem
import dev.greprepapp.app.testing.FakeForeground
import dev.greprepapp.app.testing.FakeNetwork
import dev.greprepapp.app.testing.FakeTodayApi
import dev.greprepapp.app.testing.MainDispatcherRule
import dev.greprepapp.app.testing.Reply
import dev.greprepapp.app.testing.TestGraph
import dev.greprepapp.app.testing.plan
import dev.greprepapp.app.testing.starterPlan
import dev.greprepapp.app.testing.step
import dev.greprepapp.design.StudySection
import kotlinx.coroutines.CompletableDeferred
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
import java.time.Duration

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class TodayViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    @get:Rule val folder = TemporaryFolder()

    private val api = FakeTodayApi()
    private val network = FakeNetwork()
    private val foreground = FakeForeground()

    private fun TestScope.signedIn(): TestGraph = TestGraph(this, main.dispatcher, folder.root, token = "token-1").also { it.settle() }

    private fun TestScope.viewModel(graph: TestGraph): TodayViewModel {
        val vm =
            TodayViewModel(
                api = api,
                cache = graph.cache,
                session = graph.session,
                network = network,
                reporter = graph.reporter,
                clock = graph.clock,
                foreground = foreground,
                io = main.dispatcher,
            )
        advanceUntilIdle()
        return vm
    }

    @Test
    fun showsThePlanFromTheServerAndKeepsItForOffline() =
        runTest(main.dispatcher) {
            val graph = signedIn()
            val vm = viewModel(graph)
            val content = vm.state.value.content as Content.Plan
            assertEquals(listOf("words", "verbal", "quant"), content.plan.steps.map { it.id })
            assertEquals(StudySection.Words, content.plan.current?.section)
            assertNull(vm.state.value.stale)
            assertEquals(content.plan, graph.cache.load())
        }

    @Test
    fun cachedPlanStaysWithAQuietLineWhenOffline() =
        runTest(main.dispatcher) {
            val graph = signedIn()
            graph.cache.save(plan(step("old", state = StepState.CURRENT)))
            api.reply = Reply.NetworkDown
            val vm = viewModel(graph)
            assertEquals(
                "old",
                (vm.state.value.content as Content.Plan)
                    .plan.steps
                    .single()
                    .id,
            )
            assertEquals(Problem.Offline, vm.state.value.stale)
            assertTrue("нет сети — не наш баг", graph.publicApi.reports.isEmpty())
        }

    @Test
    fun withoutCacheOfflineShowsNoConnection() =
        runTest(main.dispatcher) {
            val graph = signedIn()
            api.reply = Reply.NetworkDown
            val vm = viewModel(graph)
            assertEquals(Content.Unavailable(Problem.Offline), vm.state.value.content)
        }

    @Test
    fun serverFailureIsReportedWithItsRequestId() =
        runTest(main.dispatcher) {
            val graph = signedIn()
            api.reply = Reply.Error(400, code = "bad_request", requestId = "req-42")
            val vm = viewModel(graph)
            assertEquals(Content.Unavailable(Problem.Failed), vm.state.value.content)
            val report = graph.publicApi.reports.single()
            assertEquals("today", report.route)
            assertEquals("req-42", report.requestId)
        }

    @Test
    fun unauthorizedReturnsToSignInWithAReason() =
        runTest(main.dispatcher) {
            val graph = signedIn()
            api.reply = Reply.Error(401, code = "unauthorized")
            viewModel(graph)
            assertEquals(SessionState.SignedOut(SignOutReason.SessionExpired), graph.session.state.value)
            assertNull(graph.tokens.token)
        }

    @Test
    fun answerArrivingAfterSignOutIsDropped() =
        runTest(main.dispatcher) {
            val graph = signedIn()
            val gate = CompletableDeferred<Unit>()
            api.gate = gate
            val vm = viewModel(graph)
            graph.session.signOut()
            advanceUntilIdle()
            gate.complete(Unit)
            advanceUntilIdle()
            // Поздний ответ не вернул на устройство план вышедшего.
            assertEquals(Content.Loading, vm.state.value.content)
            assertNull(graph.cache.load())
        }

    @Test
    fun lateUnauthorizedDoesNotSignOutTheNextPerson() =
        runTest(main.dispatcher) {
            val graph = signedIn()
            val gate = CompletableDeferred<Unit>()
            api.gate = gate
            api.reply = Reply.Error(401, code = "unauthorized")
            viewModel(graph)
            graph.session.signOut()
            advanceUntilIdle()
            graph.session.didSignIn("token-2")
            gate.complete(Unit)
            advanceUntilIdle()
            assertTrue(graph.session.state.value is SessionState.SignedIn)
            assertEquals("token-2", graph.tokens.token)
        }

    @Test
    fun networkComingBackRefreshesAStalePlan() =
        runTest(main.dispatcher) {
            val graph = signedIn()
            graph.cache.save(plan(step("old", state = StepState.CURRENT)))
            api.reply = Reply.NetworkDown
            network.isOnline.value = false
            val vm = viewModel(graph)
            api.reply = Reply.Ok(starterPlan)
            network.isOnline.value = true
            advanceUntilIdle()
            assertNull(vm.state.value.stale)
            assertEquals(3, (vm.state.value.content as Content.Plan).plan.steps.size)
        }

    @Test
    fun losingNetworkShowsTheQuietLineAndReturningRefreshes() =
        runTest(main.dispatcher) {
            val graph = signedIn()
            val vm = viewModel(graph)
            network.isOnline.value = false
            advanceUntilIdle()
            assertEquals(Problem.Offline, vm.state.value.stale)
            api.reply = Reply.Ok(plan(step("fresh", Section.QUANT, StepState.CURRENT)))
            network.isOnline.value = true
            advanceUntilIdle()
            assertNull(vm.state.value.stale)
            assertEquals(
                "fresh",
                (vm.state.value.content as Content.Plan)
                    .plan.steps
                    .single()
                    .id,
            )
        }

    @Test
    fun aStepCannotStartWithoutNetworkAndSaysWhy() =
        runTest(main.dispatcher) {
            val graph = signedIn()
            val vm = viewModel(graph)
            val first = (vm.state.value.content as Content.Plan).plan.steps.first()
            network.isOnline.value = false
            advanceUntilIdle()
            assertEquals(false, vm.canStart(first))
            assertEquals(first.id, vm.state.value.blockedStepId)
            network.isOnline.value = true
            advanceUntilIdle()
            assertNull("сеть вернулась — объяснение убирается", vm.state.value.blockedStepId)
            assertEquals(true, vm.canStart(first))
        }

    @Test
    fun returningToTheAppRefetchesOnlyAnOldPlan() =
        runTest(main.dispatcher) {
            val graph = signedIn()
            viewModel(graph)
            assertEquals(1, api.calls)
            foreground.events.emit(Unit)
            advanceUntilIdle()
            assertEquals("план свежий — запроса нет", 1, api.calls)
            graph.clock.now = graph.clock.now.plus(Duration.ofMinutes(6))
            foreground.events.emit(Unit)
            advanceUntilIdle()
            assertEquals(2, api.calls)
        }

    @Test
    fun aFailedRefreshIsRetriedOnReturnEvenIfRecent() =
        runTest(main.dispatcher) {
            val graph = signedIn()
            val vm = viewModel(graph)
            api.reply = Reply.Error(500)
            vm.refresh()
            advanceUntilIdle()
            assertEquals(Problem.Failed, vm.state.value.stale)
            api.reply = Reply.Ok(plan(step("new", Section.QUANT, StepState.CURRENT)))
            vm.refreshIfStale()
            advanceUntilIdle()
            assertNull(vm.state.value.stale)
            assertEquals(
                "new",
                (vm.state.value.content as Content.Plan)
                    .plan.steps
                    .single()
                    .id,
            )
        }
}
