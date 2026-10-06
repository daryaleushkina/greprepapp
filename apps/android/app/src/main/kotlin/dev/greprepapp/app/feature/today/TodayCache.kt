package dev.greprepapp.app.feature.today

import dev.greprepapp.api.ApiJson
import dev.greprepapp.api.models.Today
import dev.greprepapp.app.core.session.PersonalData
import kotlinx.serialization.SerializationException
import java.io.File
import java.io.IOException

/**
 * Прошлый план дня на устройстве: без сети «Сегодня» показывает его со строкой «Нет сети» (решение Даши
 * 06.10.2026). Хранится ответ сервера как есть — так же, как у приложения Apple. Файл — в noBackupFilesDir.
 */
class TodayCache(
    directory: File,
) : PersonalData {
    private val file = File(directory, "today.json")

    /** null — плана нет или он не читается (старый формат, испорчен): тогда экран просто ждёт сервер. */
    fun load(): TodayPlan? {
        if (!file.exists()) return null
        return try {
            TodayPlan.from(ApiJson.decodeFromString(Today.serializer(), file.readText()))
        } catch (_: IOException) {
            null
        } catch (_: SerializationException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    fun save(today: Today) {
        val tmp = File(file.parentFile, "today.json.tmp")
        tmp.writeText(ApiJson.encodeToString(Today.serializer(), today))
        if (!tmp.renameTo(file)) throw IOException("today cache rename failed")
    }

    override fun clear() {
        if (file.exists() && !file.delete()) throw IOException("today cache delete failed")
    }
}
