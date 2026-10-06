package dev.greprepapp.app.core.report

import dev.greprepapp.api.models.ClientKind
import dev.greprepapp.app.testing.MainDispatcherRule
import dev.greprepapp.app.testing.TestGraph
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class ClientErrorReporterTest {
    @get:Rule val main = MainDispatcherRule()

    @get:Rule val folder = TemporaryFolder()

    @Test
    fun reportCarriesBuildAndTimeAndFitsTheContract() =
        runTest(main.dispatcher) {
            val graph = TestGraph(this, main.dispatcher, folder.root)
            val emoji = "😀"
            graph.reporter.report(emoji.repeat(2500), route = "today", requestId = "r".repeat(100))
            advanceUntilIdle()
            val report = graph.publicApi.reports.single()
            assertEquals(ClientKind.ANDROID, report.clientKind)
            assertEquals("0.1.0 (1)", report.appVersion)
            assertEquals("2026-10-06T09:00:00Z", report.occurredAt)
            // Сервер считает символы, а не половинки суррогатных пар: смайлик не разрезан.
            assertEquals(2000, report.message.codePointCount(0, report.message.length))
            assertEquals(64, report.requestId!!.length)
        }

    @Test
    fun takeCodePointsKeepsShortTextAsIs() {
        assertEquals("abc", "abc".takeCodePoints(5))
        assertEquals("ab", "abc".takeCodePoints(2))
    }
}
