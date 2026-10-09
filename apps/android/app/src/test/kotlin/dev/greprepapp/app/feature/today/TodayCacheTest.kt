package dev.greprepapp.app.feature.today

import dev.greprepapp.app.testing.MainDispatcherRule
import dev.greprepapp.app.testing.TestGraph
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@RunWith(RobolectricTestRunner::class)
class TodayCacheTest {
    @get:Rule val main = MainDispatcherRule()

    @get:Rule val folder = TemporaryFolder()

    @Test
    fun undeletablePreviousPlanIsOverwrittenWithEmpty() =
        runTest(main.dispatcher) {
            val g = TestGraph(this, main.dispatcher, folder.root)
            val file =
                object : File(folder.root, "stuck.json") {
                    override fun delete(): Boolean = false
                }
            val cache = TodayCache(folder.root, g.reporter, file)
            cache.save(dev.greprepapp.app.testing.starterPlan)
            cache.clear()
            assertTrue(file.readText().isEmpty())
        }

    @Test
    fun fileReadFailureIsReportedAndTheUnreadableFileIsRemoved() =
        runTest(main.dispatcher) {
            val g = TestGraph(this, main.dispatcher, folder.root)
            val file = File(folder.root, "today.json").apply { mkdirs() }
            assertNull(g.cache.load())
            g.settle()
            assertFalse(file.exists())
            assertTrue(
                g.publicApi.reports
                    .single()
                    .message
                    .contains("FileNotFoundException"),
            )
        }

    @Test
    fun anUnwritableAndUndeletableCacheStopsSignInBeforeSavingTheToken() =
        runTest(main.dispatcher) {
            val g = TestGraph(this, main.dispatcher, folder.root)
            val file = File(folder.root, "today.json").apply { mkdirs() }
            File(file, "block").writeText("test")
            val manager =
                dev.greprepapp.app.core.session.SessionManager(
                    g.tokens,
                    g.holder,
                    setOf(g.cache),
                    {},
                    g.reporter,
                    {
                        dev.greprepapp.api.ApiResult
                            .Ok("owner")
                    },
                    g.appScope,
                    main.dispatcher,
                )
            g.settle()
            val failure =
                try {
                    manager.didSignIn("new-token", "owner")
                    null
                } catch (error: java.io.IOException) {
                    error
                }
            org.junit.Assert.assertNotNull(failure)
            assertNull(g.tokens.token)
            assertNull(g.holder.token)
            assertTrue(manager.state.value is dev.greprepapp.app.core.session.SessionState.SignedOut)
            assertNull(g.cache.load())
            g.settle()
            assertTrue(g.publicApi.reports.any { it.message.startsWith("today cache clear failed") })
        }

    @Test
    fun unreadableCacheIsReportedWithoutItsPathAndDeleted() =
        runTest(main.dispatcher) {
            val g = TestGraph(this, main.dispatcher, folder.root)
            val file = File(folder.root, "today.json").apply { writeText("{broken") }
            assertNull(g.cache.load())
            g.settle()
            assertFalse(file.exists())
            val message =
                g.publicApi.reports
                    .single()
                    .message
            assertTrue(message.contains("JsonDecodingException"))
            assertFalse(message.contains(folder.root.path))
        }
}
