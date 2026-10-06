package dev.greprepapp.app.core.session

import dev.greprepapp.app.testing.MainDispatcherRule
import dev.greprepapp.app.testing.TestGraph
import dev.greprepapp.app.testing.starterPlan
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
import java.security.GeneralSecurityException
import java.security.ProviderException

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class SessionManagerTest {
    @get:Rule val main = MainDispatcherRule()

    @get:Rule val folder = TemporaryFolder()

    private fun TestScope.graph(
        token: String?,
        configure: TestGraph.() -> Unit = {},
    ): TestGraph {
        // Сбой хранилища нужно задать до того, как менеджер начнёт читать вход.
        val graph = TestGraph(this, main.dispatcher, folder.root, token = token)
        graph.configure()
        graph.settle()
        return graph
    }

    @Test
    fun savedTokenSignsInWithoutWaitingForNetwork() =
        runTest(main.dispatcher) {
            val graph = graph(token = "saved")
            assertEquals(SessionState.SignedIn(1), graph.session.state.value)
            assertEquals("saved", graph.holder.token)
        }

    @Test
    fun noTokenOrEmptyTokenMeansSignedOut() =
        runTest(main.dispatcher) {
            assertEquals(SessionState.SignedOut(null), graph(token = null).session.state.value)
            assertEquals(SessionState.SignedOut(null), graph(token = "").session.state.value)
        }

    @Test
    fun unreadableTokenIsWipedAndReported() =
        runTest(main.dispatcher) {
            val graph = graph(token = "garbage") { tokens.readFailure = GeneralSecurityException("bad key") }
            assertEquals(SessionState.SignedOut(null), graph.session.state.value)
            assertNull(graph.tokens.token)
            assertEquals(
                "launch",
                graph.publicApi.reports
                    .single()
                    .route,
            )
        }

    @Test
    fun keystoreHardwareFailureOnLaunchSignsOutInsteadOfCrashing() =
        runTest(main.dispatcher) {
            // Keystore на части прошивок бросает ProviderException (RuntimeException), а не GeneralSecurityException.
            val graph = graph(token = "saved") { tokens.readFailure = ProviderException("keystore hardware") }
            assertEquals(SessionState.SignedOut(null), graph.session.state.value)
            assertNull(graph.tokens.token)
            assertEquals(
                "launch",
                graph.publicApi.reports
                    .single()
                    .route,
            )
        }

    @Test
    fun personalDataIsNotWrittenForASessionThatEnded() =
        runTest(main.dispatcher) {
            val graph = graph(token = "a")
            graph.session.signOut()
            advanceUntilIdle()
            val written = graph.session.writeIfCurrent(id = 1) { graph.cache.save(starterPlan) }
            assertEquals(false, written)
            assertNull(graph.cache.load())
        }

    @Test
    fun signInStoresTokenAndForgetsThePreviousPerson() =
        runTest(main.dispatcher) {
            val graph = graph(token = null)
            graph.cache.save(starterPlan)
            graph.session.didSignIn("fresh")
            assertEquals("fresh", graph.tokens.token)
            assertEquals("fresh", graph.holder.token)
            assertNull("план прошлого человека стёрт", graph.cache.load())
            assertTrue(graph.session.state.value is SessionState.SignedIn)
        }

    @Test
    fun eachSignInGetsANewId() =
        runTest(main.dispatcher) {
            val graph = graph(token = "a")
            graph.session.signOut()
            advanceUntilIdle()
            graph.session.didSignIn("b")
            assertEquals(SessionState.SignedIn(2), graph.session.state.value)
            assertTrue(graph.session.isCurrent(2))
            assertTrue(!graph.session.isCurrent(1))
        }

    @Test
    fun signOutWipesTheDeviceFirstAndTellsTheServer() =
        runTest(main.dispatcher) {
            val graph = graph(token = "mine")
            graph.cache.save(starterPlan)
            graph.session.signOut()
            advanceUntilIdle()
            assertEquals(SessionState.SignedOut(null), graph.session.state.value)
            assertNull(graph.tokens.token)
            assertNull(graph.holder.token)
            assertNull(graph.cache.load())
            assertEquals(listOf("mine"), graph.serverSignOuts)
        }

    @Test
    fun undeletableTokenIsOverwrittenWithEmpty() =
        runTest(main.dispatcher) {
            val graph = graph(token = "stuck")
            graph.tokens.clearFailure = IOException("read-only")
            graph.session.signOut()
            advanceUntilIdle()
            assertEquals("", graph.tokens.token)
            assertEquals(SessionState.SignedOut(null), graph.session.state.value)
            assertEquals(
                "sign-out",
                graph.publicApi.reports
                    .single()
                    .route,
            )
        }

    @Test
    fun unauthorizedOnlyEndsTheSessionItBelongsTo() =
        runTest(main.dispatcher) {
            val graph = graph(token = "a")
            graph.session.handleUnauthorized(id = 99)
            advanceUntilIdle()
            assertEquals("чужой 401 не выкидывает", SessionState.SignedIn(1), graph.session.state.value)
            graph.session.handleUnauthorized(id = 1)
            advanceUntilIdle()
            assertEquals(SessionState.SignedOut(SignOutReason.SessionExpired), graph.session.state.value)
        }
}
