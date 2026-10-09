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
    fun corruptOwnerIsReportedEvenIfConnectReadsItBeforeTheRepository() {
        val dir = File(folder.root, "trainings").apply { mkdirs() }
        File(dir, "owner.json").writeText("{broken")
        val store = TrainingStore(folder.root)
        store.connect("owner", "test-token")
        assertEquals(listOf("JsonDecodingException"), store.load())
        assertTrue(store.load().isEmpty())
    }

    @Test
    fun expiredOwnerKeepsFilesButHidesTheTrainingsUntilReconnected() {
        val store = TrainingStore(folder.root)
        store.connect("owner", "test-token")
        store.put(training)
        store.expire()
        assertTrue(store.visible.value.isEmpty())
        val again = TrainingStore(folder.root)
        assertEquals(training, again.get(training.id))
        assertFalse(again.isConnected("different-token"))
        assertTrue(again.visible.value.isEmpty())
        assertTrue(again.isConnected("test-token"))
        assertEquals(training, again.visible.value[training.id])
    }

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
    fun unreadableFileIsSetAsideAndReported() {
        val dir = File(folder.root, "trainings").apply { mkdirs() }
        File(dir, "broken.training.json").writeText("{not json")
        val store = TrainingStore(folder.root)
        val dropped = store.load()
        assertTrue(store.trainings.value.isEmpty())
        assertEquals("о потере — в отчёт, по классу ошибки", listOf("JsonDecodingException"), dropped)
        assertFalse("второй раз не читается", File(dir, "broken.training.json").exists())
        assertTrue("файл не стёрт — отложен, неотправленное в нём можно достать", File(dir, "broken.training.json.broken").exists())
    }

    @Test
    fun fileThatCannotBeOpenedNowIsKept() {
        // Папка на месте файла: чтение бросает IOException, как недоступный в эту минуту файл.
        val dir = File(folder.root, "trainings").apply { mkdirs() }
        val busy = File(dir, "busy.training.json").apply { mkdirs() }
        val dropped = TrainingStore(folder.root).load()
        assertEquals(1, dropped.size)
        assertTrue("не порча — не трогаем, прочтётся в следующий раз", busy.exists())
    }

    @Test
    fun unreadableReportsAreSetAsideAndReported() {
        val dir = File(folder.root, "trainings").apply { mkdirs() }
        File(dir, "reports.json").writeText("[{")
        val store = TrainingStore(folder.root)
        assertEquals(1, store.load().size)
        assertTrue(File(dir, "reports.json.broken").exists())
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
