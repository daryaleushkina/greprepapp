package dev.greprepapp.app.feature.training

import dev.greprepapp.api.ApiJson
import dev.greprepapp.api.models.QuestionReport
import dev.greprepapp.app.core.session.PersonalData
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.ListSerializer
import java.io.File
import java.io.IOException

/** «Сообщить об ошибке», которое ещё не дошло до сервера: без сети жалоба не теряется. */
@Serializable
data class PendingReport(
    val questionId: String,
    val report: QuestionReport,
)

/**
 * Тренировки на устройстве — по файлу на тренировку, рядом очередь жалоб; всё в noBackupFilesDir, как кэш
 * «Сегодня». Запись — через временный файл и переименование: оборванная запись не портит прошлую. В памяти —
 * то же самое потоком, чтобы экраны видели изменения сразу. Методы синхронные и под одним замком: зовут их с
 * IoDispatcher, а выход (clear) идёт под замком SessionManager.
 */
class TrainingStore(
    directory: File,
) : PersonalData {
    private val dir = File(directory, "trainings")
    private val reportsFile = File(dir, "reports.json")
    private val mutableTrainings = MutableStateFlow<Map<String, StoredTraining>>(emptyMap())
    private val mutableReports = MutableStateFlow<List<PendingReport>>(emptyList())
    private var loaded = false

    val trainings: StateFlow<Map<String, StoredTraining>> = mutableTrainings.asStateFlow()
    val reports: StateFlow<List<PendingReport>> = mutableReports.asStateFlow()

    /** Прочитать с диска один раз. Нечитаемый файл (старый формат, испорчен) пропускается и удаляется. */
    @Synchronized
    fun load() {
        if (loaded) return
        loaded = true
        val files = dir.listFiles { f -> f.name.endsWith(TRAINING_SUFFIX) }.orEmpty()
        mutableTrainings.value =
            files
                .mapNotNull { file -> read(file, StoredTraining.serializer()).also { if (it == null) file.delete() } }
                .associateBy { it.id }
        mutableReports.value = read(reportsFile, ListSerializer(PendingReport.serializer())).orEmpty()
    }

    @Synchronized
    fun get(id: String): StoredTraining? {
        load()
        return mutableTrainings.value[id]
    }

    /**
     * Сначала память, потом диск: не записалось (место кончилось) — тренировка идёт дальше, а бросок доходит до
     * отчёта; следующая удачная запись сохранит всё сразу.
     */
    @Synchronized
    fun put(training: StoredTraining) {
        load()
        mutableTrainings.value += training.id to training
        write(File(dir, training.id + TRAINING_SUFFIX), StoredTraining.serializer(), training)
    }

    @Synchronized
    fun remove(id: String) {
        load()
        val file = File(dir, id + TRAINING_SUFFIX)
        if (file.exists() && !file.delete()) throw IOException("training delete failed")
        mutableTrainings.value -= id
    }

    @Synchronized
    fun putReports(reports: List<PendingReport>) {
        load()
        mutableReports.value = reports
        write(reportsFile, ListSerializer(PendingReport.serializer()), reports)
    }

    /** Выход: тренировки и жалобы прошлого человека стираются вместе с ним. */
    @Synchronized
    override fun clear() {
        loaded = true
        mutableTrainings.value = emptyMap()
        mutableReports.value = emptyList()
        if (dir.exists() && !dir.deleteRecursively()) throw IOException("trainings delete failed")
    }

    private fun <T> read(
        file: File,
        serializer: KSerializer<T>,
    ): T? {
        if (!file.exists()) return null
        return try {
            ApiJson.decodeFromString(serializer, file.readText())
        } catch (_: IOException) {
            null
        } catch (_: SerializationException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    private fun <T> write(
        file: File,
        serializer: KSerializer<T>,
        value: T,
    ) {
        if (!dir.exists() && !dir.mkdirs()) throw IOException("trainings directory create failed")
        val tmp = File(dir, file.name + ".tmp")
        tmp.writeText(ApiJson.encodeToString(serializer, value))
        if (!tmp.renameTo(file)) throw IOException("training rename failed")
    }

    private companion object {
        const val TRAINING_SUFFIX = ".training.json"
    }
}
