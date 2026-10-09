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
import java.security.MessageDigest

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
    private val ownerFile = File(dir, "owner.json")
    private var owner: Owner? = null
    private var connected = false
    private val mutableVisible = MutableStateFlow<Map<String, StoredTraining>>(emptyMap())
    val visible: StateFlow<Map<String, StoredTraining>> = mutableVisible.asStateFlow()
    private val loadProblems = mutableListOf<String>()

    private fun publish() {
        mutableVisible.value = if (connected) mutableTrainings.value else emptyMap()
    }

    @Serializable
    private data class Owner(
        val id: String,
        val credentialHash: String,
    )

    private fun credentialHash(credential: String): String =
        MessageDigest.getInstance("SHA-256").digest(credential.toByteArray()).joinToString("") { "%02x".format(it) }

    @Synchronized
    override fun isConnected(credential: String): Boolean {
        ensureLoaded()
        return (owner?.credentialHash == credentialHash(credential)).also {
            connected = it
            publish()
        }
    }

    /** 401 отсоединяет сеть, но не стирает тренировки (решение Даши 09.10.2026, #25). */
    @Synchronized
    override fun expire() {
        connected = false
        publish()
    }

    @Synchronized
    override fun connect(
        ownerId: String,
        credential: String,
    ): String? {
        ensureLoaded()
        val changed = owner?.id != ownerId
        val answers = if (changed) mutableTrainings.value.values.sumOf { it.unsent.size } else 0
        val reports = if (changed) mutableReports.value.size else 0
        if (changed) clear()
        val next = Owner(ownerId, credentialHash(credential))
        write(ownerFile, Owner.serializer(), next)
        owner = next
        connected = true
        publish()
        return if (answers + reports > 0) "training owner changed: lost answers=$answers reports=$reports" else null
    }

    private val mutableTrainings = MutableStateFlow<Map<String, StoredTraining>>(emptyMap())
    private val mutableReports = MutableStateFlow<List<PendingReport>>(emptyList())
    private var loaded = false

    val trainings: StateFlow<Map<String, StoredTraining>> = mutableTrainings.asStateFlow()
    val reports: StateFlow<List<PendingReport>> = mutableReports.asStateFlow()

    /**
     * Прочитать с диска один раз. Возвращает, что не прочиталось (класс ошибки, без пути), — для отчёта: в
     * файле могли быть неотправленные ответы, и потеря не должна быть тихой. Испорченное или старого формата
     * (новое обязательное поле в договоре) откладывается в сторону, а не стирается; не открывшееся сейчас
     * (IOException) не трогается — прочтётся в следующий раз.
     */
    @Synchronized
    fun load(): List<String> {
        ensureLoaded()
        return loadProblems.toList().also { loadProblems.clear() }
    }

    private fun ensureLoaded() {
        if (loaded) return
        loaded = true
        val dropped = mutableListOf<String>()
        owner =
            when (val r = read(ownerFile, Owner.serializer())) {
                is Read.Ok -> {
                    r.value
                }

                Read.Missing -> {
                    null
                }

                is Read.Failed -> {
                    dropped += r.reason
                    setAside(ownerFile)
                    null
                }
            }
        val files = dir.listFiles { f -> f.name.endsWith(TRAINING_SUFFIX) }.orEmpty()
        mutableTrainings.value =
            files
                .mapNotNull { file ->
                    when (val r = read(file, StoredTraining.serializer())) {
                        is Read.Ok -> {
                            r.value
                        }

                        Read.Missing -> {
                            null
                        }

                        is Read.Failed -> {
                            dropped += r.reason
                            if (r is Read.Corrupt) setAside(file)
                            null
                        }
                    }
                }.associateBy { it.id }
        mutableReports.value =
            when (val r = read(reportsFile, ListSerializer(PendingReport.serializer()))) {
                is Read.Ok -> {
                    r.value
                }

                Read.Missing -> {
                    emptyList()
                }

                // Очередь жалоб — один файл, следующая запись перезаписала бы его: и испорченный, и не
                // открывшийся — в сторону.
                is Read.Failed -> {
                    dropped += r.reason
                    setAside(reportsFile)
                    emptyList()
                }
            }
        loadProblems += dropped
        publish()
    }

    /** Отложить нечитаемый файл: он больше не читается, но и не пропадает (выход сотрёт и его). */
    private fun setAside(file: File) {
        file.renameTo(File(dir, file.name + BROKEN_SUFFIX))
    }

    @Synchronized
    fun get(id: String): StoredTraining? {
        ensureLoaded()
        return mutableTrainings.value[id]
    }

    /**
     * Сначала память, потом диск: не записалось (место кончилось) — тренировка идёт дальше, а бросок доходит до
     * отчёта; следующая удачная запись сохранит всё сразу.
     */
    @Synchronized
    fun put(training: StoredTraining) {
        ensureLoaded()
        mutableTrainings.value += training.id to training
        publish()
        write(File(dir, training.id + TRAINING_SUFFIX), StoredTraining.serializer(), training)
    }

    @Synchronized
    fun remove(id: String) {
        ensureLoaded()
        val file = File(dir, id + TRAINING_SUFFIX)
        if (file.exists() && !file.delete()) throw IOException("training delete failed")
        mutableTrainings.value -= id
        publish()
    }

    @Synchronized
    fun putReports(reports: List<PendingReport>) {
        ensureLoaded()
        mutableReports.value = reports
        write(reportsFile, ListSerializer(PendingReport.serializer()), reports)
    }

    /** Выход: тренировки и жалобы прошлого человека стираются вместе с ним. */
    @Synchronized
    override fun clear() {
        loaded = true
        owner = null
        connected = false
        publish()
        mutableTrainings.value = emptyMap()
        mutableReports.value = emptyList()
        if (dir.exists() && !dir.deleteRecursively()) throw IOException("trainings delete failed")
    }

    /** Итог чтения файла: прочитан, нет его, испорчен или не открылся сейчас. */
    private sealed interface Read<out T> {
        data class Ok<T>(
            val value: T,
        ) : Read<T>

        data object Missing : Read<Nothing>

        sealed interface Failed : Read<Nothing> {
            val reason: String
        }

        data class Corrupt(
            override val reason: String,
        ) : Failed

        data class Unavailable(
            override val reason: String,
        ) : Failed
    }

    private fun <T> read(
        file: File,
        serializer: KSerializer<T>,
    ): Read<T> {
        if (!file.exists()) return Read.Missing
        val text =
            try {
                file.readText()
            } catch (failure: IOException) {
                return Read.Unavailable(failure.javaClass.simpleName)
            }
        return try {
            Read.Ok(ApiJson.decodeFromString(serializer, text))
        } catch (failure: SerializationException) {
            Read.Corrupt(failure.javaClass.simpleName)
        } catch (failure: IllegalArgumentException) {
            Read.Corrupt(failure.javaClass.simpleName)
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
        const val BROKEN_SUFFIX = ".broken"
    }
}
