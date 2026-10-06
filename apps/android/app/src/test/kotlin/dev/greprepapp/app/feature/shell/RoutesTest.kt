package dev.greprepapp.app.feature.shell

import androidx.navigation3.runtime.NavKey
import org.junit.Assert.assertEquals
import org.junit.Test

class RoutesTest {
    @Test
    fun backNeverEmptiesTheStack() {
        val stack = mutableListOf<NavKey>(MainRoute.Tabs, MainRoute.Builder())
        stack.popUnlessRoot()
        stack.popUnlessRoot()
        assertEquals(listOf<NavKey>(MainRoute.Tabs), stack)
    }
}
