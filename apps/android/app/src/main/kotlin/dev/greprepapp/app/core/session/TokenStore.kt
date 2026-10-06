package dev.greprepapp.app.core.session

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.io.File
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.security.ProviderException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Где лежит токен сессии. Пустой или отсутствующий токен — «не вошёл». */
interface TokenStore {
    /** null — токена нет; бросает, если хранилище не прочиталось (ключ Keystore испорчен, файл не читается). */
    fun read(): String?

    fun save(token: String)

    fun clear()
}

/**
 * Токен — файлом в noBackupFilesDir, зашифрованным AES-GCM ключом из Android Keystore: ключ не покидает
 * защищённое железо и не попадает в резервную копию. EncryptedSharedPreferences (security-crypto) устарела,
 * Tink — лишние мегабайты ради одного ключа.
 *
 * key — откуда брать ключ: в приложении — Android Keystore, в тестах формата файла — обычный ключ AES (в
 * Robolectric Keystore нет).
 */
class KeystoreTokenStore(
    directory: File,
    private val key: () -> SecretKey = ::androidKeystoreKey,
) : TokenStore {
    private val file = File(directory, FILE_NAME)

    override fun read(): String? {
        if (!file.exists()) return null
        val raw = file.readText().trim()
        if (raw.isEmpty()) return null
        val parts = raw.split(SEPARATOR, limit = 2)
        if (parts.size != 2) throw IOException("token file is malformed")
        val (iv, data) = parts.map { Base64.decode(it, Base64.NO_WRAP) }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, iv))
        return cipher.doFinal(data).toString(Charsets.UTF_8)
    }

    override fun save(token: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val data = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        val encoded =
            Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + SEPARATOR + Base64.encodeToString(data, Base64.NO_WRAP)
        // Запись целиком во временный файл и замена: оборванная запись не оставит полтокена.
        val tmp = File(file.parentFile, "$FILE_NAME.tmp")
        tmp.writeText(encoded)
        if (!tmp.renameTo(file)) throw IOException("token file rename failed")
    }

    override fun clear() {
        if (file.exists() && !file.delete()) throw IOException("token file delete failed")
    }

    private companion object {
        const val FILE_NAME = "session.token"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val TAG_BITS = 128
        const val SEPARATOR = ":"
    }
}

private const val KEYSTORE = "AndroidKeyStore"
private const val ALIAS = "greprep.session"
private const val KEY_BITS = 256

/** Ключ сессии в Android Keystore: создаётся при первом входе и не покидает защищённое железо. */
private fun androidKeystoreKey(): SecretKey {
    val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
    generator.init(
        KeyGenParameterSpec
            .Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(KEY_BITS)
            .build(),
    )
    return generator.generateKey()
}

/**
 * Ошибки хранилища, которые значат «токена нет или он испорчен», а не баг приложения. ProviderException —
 * RuntimeException, которым Keystore на части прошивок сообщает о сбое защищённого железа.
 */
internal fun Throwable.isStorageFailure(): Boolean =
    this is GeneralSecurityException ||
        this is IOException ||
        this is IllegalArgumentException ||
        this is ProviderException
