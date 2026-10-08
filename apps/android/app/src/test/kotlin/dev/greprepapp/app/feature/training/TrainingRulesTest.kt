package dev.greprepapp.app.feature.training

import dev.greprepapp.api.models.TrainingFinish
import dev.greprepapp.app.testing.Fixtures
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class TrainingRulesTest {
    /** Неразбираемая дата — особенность хранения Android, в общем файле даты соответствуют договору. */
    @Test
    fun durationIsZeroWhenTheEndIsUnreadable() {
        val training =
            StoredTraining(
                session = Fixtures.session(Fixtures.tc1),
                startedAtMillis = Instant.parse("2026-10-06T09:00:00Z").toEpochMilli(),
                finish = TrainingFinish("not a date", timedOut = false),
            )
        assertEquals(0, TrainingRules.durationSeconds(training))
    }
}
