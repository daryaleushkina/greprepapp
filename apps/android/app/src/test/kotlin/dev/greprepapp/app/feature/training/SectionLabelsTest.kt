package dev.greprepapp.app.feature.training

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import dev.greprepapp.api.models.Section
import dev.greprepapp.app.ui.label
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SectionLabelsTest {
    @Test
    fun toeflNamesAreNotGreNames() {
        val resources = ApplicationProvider.getApplicationContext<Context>().resources
        for ((section, name) in listOf(
            Section.READING to "Reading",
            Section.LISTENING to "Listening",
            Section.WRITING to "Writing",
            Section.SPEAKING to "Speaking",
        )) {
            assertEquals(name, section.label(resources))
        }
    }
}
