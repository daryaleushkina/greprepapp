package dev.greprepapp.app.core.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.io.IOException
import java.security.GeneralSecurityException
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/**
 * Формат файла токена (вектор и шифртекст в Base64 через «:», запись через временный файл). Ключ — обычный AES
 * вместо Keystore: Keystore в Robolectric нет, его проверка на устройстве — #14.
 */
@RunWith(RobolectricTestRunner::class)
class KeystoreTokenStoreTest {
    @get:Rule val folder = TemporaryFolder()

    private val key: SecretKey = KeyGenerator.getInstance("AES").apply { init(KEY_BITS) }.generateKey()

    private fun store(key: SecretKey = this.key) = KeystoreTokenStore(folder.root) { key }

    private val file get() = File(folder.root, "session.token")

    @Test
    fun savedTokenReadsBackAndIsNotStoredInPlainText() {
        store().save("secret-token")
        assertEquals("secret-token", store().read())
        assertFalse("токен не лежит открытым текстом", file.readText().contains("secret-token"))
        assertFalse("временный файл не остаётся", File(folder.root, "session.token.tmp").exists())
    }

    @Test
    fun eachSaveUsesAFreshIv() {
        store().save("same")
        val first = file.readText()
        store().save("same")
        assertNotEquals("один вектор на два шифрования GCM — уязвимость", first, file.readText())
    }

    @Test
    fun missingOrEmptyFileMeansNoToken() {
        assertNull(store().read())
        file.writeText("  ")
        assertNull(store().read())
    }

    @Test
    fun clearRemovesTheToken() {
        store().save("t")
        store().clear()
        assertNull(store().read())
        store().clear()
    }

    @Test(expected = IOException::class)
    fun malformedFileIsAStorageFailure() {
        file.writeText("no-separator")
        store().read()
    }

    @Test
    fun tokenFromAnotherKeyIsAStorageFailureNotAnotherToken() {
        store().save("t")
        val other = KeyGenerator.getInstance("AES").apply { init(KEY_BITS) }.generateKey()
        val failure = runCatching { store(other).read() }.exceptionOrNull()
        assertTrue("ожидалась ошибка хранилища, было: $failure", failure is GeneralSecurityException)
        assertTrue(failure!!.isStorageFailure())
    }

    private companion object {
        const val KEY_BITS = 256
    }
}
