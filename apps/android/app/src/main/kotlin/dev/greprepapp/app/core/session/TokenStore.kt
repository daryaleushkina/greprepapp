package dev.greprepapp.app.core.session

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.io.File
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
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
 */
class KeystoreTokenStore(
    context: Context,
) : TokenStore {
    private val file = File(context.noBackupFilesDir, FILE_NAME)

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

    private fun key(): SecretKey {
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

    private companion object {
        const val FILE_NAME = "session.token"
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "greprep.session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val TAG_BITS = 128
        const val KEY_BITS = 256
        const val SEPARATOR = ":"
    }
}

/** Ошибки хранилища, которые значат «токена нет или он испорчен», а не баг приложения. */
internal fun Throwable.isStorageFailure(): Boolean =
    this is GeneralSecurityException || this is IOException || this is IllegalArgumentException
