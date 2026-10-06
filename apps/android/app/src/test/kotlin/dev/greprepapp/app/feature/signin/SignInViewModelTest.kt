package dev.greprepapp.app.feature.signin

import dev.greprepapp.api.models.ClientKind
import dev.greprepapp.api.models.SessionTransport
import dev.greprepapp.app.core.session.SessionState
import dev.greprepapp.app.feature.signin.SignInViewModel.Message
import dev.greprepapp.app.feature.signin.SignInViewModel.Method
import dev.greprepapp.app.testing.FakeAuthApi
import dev.greprepapp.app.testing.MainDispatcherRule
import dev.greprepapp.app.testing.Reply
import dev.greprepapp.app.testing.TestGraph
import dev.greprepapp.app.testing.session
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
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class SignInViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    @get:Rule val folder = TemporaryFolder()

    private val auth = FakeAuthApi()

    private fun TestScope.setUp(devSignIn: Boolean = true): Pair<TestGraph, SignInViewModel> {
        val graph = TestGraph(this, main.dispatcher, folder.root, devSignIn = devSignIn)
        graph.settle()
        return graph to SignInViewModel(auth, graph.session, graph.config, graph.reporter)
    }

    @Test
    fun developmentSignInStartsASession() =
        runTest(main.dispatcher) {
            val (graph, vm) = setUp()
            vm.signInForDevelopment("  anna  ")
            assertEquals(Method.Development, vm.state.value.busy)
            advanceUntilIdle()
            val request = auth.devSignIns.single()
            assertEquals("anna", request.name)
            assertEquals(SessionTransport.BEARER, request.transport)
            assertEquals(ClientKind.ANDROID, request.clientKind)
            assertTrue(graph.session.state.value is SessionState.SignedIn)
            assertEquals("token-1", graph.tokens.token)
            assertEquals(SignInViewModel.UiState(), vm.state.value)
        }

    @Test
    fun developmentSignInIsAbsentWhenTheBuildDoesNotAllowIt() =
        runTest(main.dispatcher) {
            val (_, vm) = setUp(devSignIn = false)
            vm.signInForDevelopment("anna")
            advanceUntilIdle()
            assertTrue(auth.devSignIns.isEmpty())
        }

    @Test
    fun blankNameDoesNothing() =
        runTest(main.dispatcher) {
            val (_, vm) = setUp()
            vm.signInForDevelopment("   ")
            advanceUntilIdle()
            assertTrue(auth.devSignIns.isEmpty())
            assertNull(vm.state.value.busy)
        }

    @Test
    fun offlineSaysSoUnderTheButtons() =
        runTest(main.dispatcher) {
            val (graph, vm) = setUp()
            auth.reply = Reply.NetworkDown
            vm.signInForDevelopment("anna")
            advanceUntilIdle()
            assertEquals(Message.Offline, vm.state.value.message)
            assertTrue(graph.publicApi.reports.isEmpty())
        }

    @Test
    fun rateLimitAsksToWait() =
        runTest(main.dispatcher) {
            val (_, vm) = setUp()
            auth.reply = Reply.Error(429, code = "too_many_requests")
            vm.signInForDevelopment("anna")
            advanceUntilIdle()
            assertEquals(Message.TooManyAttempts, vm.state.value.message)
        }

    @Test
    fun serverFailureIsReported() =
        runTest(main.dispatcher) {
            val (graph, vm) = setUp()
            auth.reply = Reply.Error(500, requestId = "req-7")
            vm.signInForDevelopment("anna")
            advanceUntilIdle()
            assertEquals(Message.Failed, vm.state.value.message)
            assertEquals(
                "req-7",
                graph.publicApi.reports
                    .single()
                    .requestId,
            )
        }

    @Test
    fun sessionWithoutTokenIsAContractBreak() =
        runTest(main.dispatcher) {
            val (graph, vm) = setUp()
            auth.reply = Reply.Ok(session(token = null))
            vm.signInForDevelopment("anna")
            advanceUntilIdle()
            assertEquals(Message.Failed, vm.state.value.message)
            assertEquals(SessionState.SignedOut(null), graph.session.state.value)
            assertEquals(1, graph.publicApi.reports.size)
        }

    @Test
    fun tokenThatCannotBeSavedFailsHonestly() =
        runTest(main.dispatcher) {
            val (graph, vm) = setUp()
            graph.tokens.saveFailure = IOException("disk full")
            vm.signInForDevelopment("anna")
            advanceUntilIdle()
            assertEquals(Message.Failed, vm.state.value.message)
            assertEquals(SessionState.SignedOut(null), graph.session.state.value)
        }

    @Test
    fun providersWithoutAccountsSayNotConnectedYet() =
        runTest(main.dispatcher) {
            val (_, vm) = setUp()
            for (method in listOf(Method.Telegram, Method.Apple, Method.Google)) {
                vm.signInWith(method)
                assertEquals(Message.NotConnectedYet(method), vm.state.value.message)
            }
        }
}
