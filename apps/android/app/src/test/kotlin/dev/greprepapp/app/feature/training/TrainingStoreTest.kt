package dev.greprepapp.app.feature.training

import dev.greprepapp.api.models.QuestionReport
import dev.greprepapp.app.testing.Fixtures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.IOException

class TrainingStoreTest {
    @get:Rule val folder = TemporaryFolder()

    private val training = StoredTraining(Fixtures.session(Fixtures.tc1, Fixtures.se), startedAtMillis = 1L, position = 1)

    @Test
    fun keepsTrainingsAndReportsAcrossLaunches() {
        val store = TrainingStore(folder.root)
        store.put(training)
        store.putReports(listOf(PendingReport("q-1", QuestionReport(QuestionReport.Kind.OTHER))))
        val again = TrainingStore(folder.root)
        assertEquals(training, again.get(training.id))
        assertEquals(
            "q-1",
            again.reports.value
                .single()
                .questionId,
        )
    }

    @Test
    fun unreadableFileIsDroppedNotFatal() {
        val dir = File(folder.root, "trainings").apply { mkdirs() }
        File(dir, "broken.training.json").writeText("{not json")
        val store = TrainingStore(folder.root)
        store.load()
        assertTrue(store.trainings.value.isEmpty())
        assertFalse("испорченный файл убран, чтобы не читать его каждый раз", File(dir, "broken.training.json").exists())
    }

    @Test
    fun signOutWipesEverything() {
        val store = TrainingStore(folder.root)
        store.put(training)
        store.clear()
        assertTrue(store.trainings.value.isEmpty())
        assertNull(TrainingStore(folder.root).get(training.id))
    }

    @Test
    fun failedWriteKeepsTheTrainingInMemoryAndThrows() {
        // Вместо папки — файл: записать внутрь нельзя, как при полном диске.
        val blocked = File(folder.root, "blocked").apply { writeText("") }
        val store = TrainingStore(blocked)
        assertThrows(IOException::class.java) { store.put(training) }
        assertEquals("тренировка идёт дальше, ошибка — в отчёт", training, store.trainings.value[training.id])
    }

    @Test
    fun removeDeletesTheFile() {
        val store = TrainingStore(folder.root)
        store.put(training)
        store.remove(training.id)
        assertNull(TrainingStore(folder.root).get(training.id))
    }
}
