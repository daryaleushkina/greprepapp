package dev.greprepapp.app.feature.signin

import androidx.test.core.app.ApplicationProvider
import dev.greprepapp.api.ApiJson
import dev.greprepapp.api.GrePrepApi
import dev.greprepapp.api.models.AuthorizationCodeSignIn
import dev.greprepapp.api.models.DevSignIn
import dev.greprepapp.api.models.IdTokenSignIn
import dev.greprepapp.api.models.IdentityProvider
import dev.greprepapp.api.models.Locale
import dev.greprepapp.api.models.SessionTransport
import dev.greprepapp.app.di.NetworkModule
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
class SignInLocaleTest {
    @Test
    @Config(qualifiers = "en")
    fun nativeTokenSignInSendsTheInterfaceLanguage() = checkRequests("en")

    @Test
    @Config(qualifiers = "ru")
    fun russianInterfaceSendsRussianInEverySignInRequest() = checkRequests("ru")

    @Test
    @Config(qualifiers = "fr")
    fun unsupportedSystemLanguageUsesTheRussianInterface() = checkRequests("ru")

    private fun checkRequests(expected: String) =
        runTest {
            MockWebServer().use { server ->
                server.start()
                repeat(3) {
                    server.enqueue(
                        MockResponse
                            .Builder()
                            .code(400)
                            .body("{}")
                            .build(),
                    )
                }
                val api =
                    NetworkModule.authApi(
                        GrePrepApi(server.url("/"), OkHttpClient()),
                        SignInLocale(ApplicationProvider.getApplicationContext()),
                    )
                api.signInWithIdToken(
                    IdTokenSignIn(IdentityProvider.GOOGLE, "test-token", "nonce", SessionTransport.BEARER, locale = Locale.RU),
                )
                api.signInWithAuthorizationCode(
                    AuthorizationCodeSignIn(
                        IdentityProvider.TELEGRAM,
                        "test-code",
                        "verifier",
                        "https://example.invalid",
                        SessionTransport.BEARER,
                    ),
                )
                api.signInForDevelopment(DevSignIn("test", SessionTransport.BEARER))
                repeat(3) {
                    val json = ApiJson.parseToJsonElement(server.takeRequest().body!!.utf8()).jsonObject
                    assertEquals(expected, json["locale"]?.jsonPrimitive?.content)
                }
            }
        }
}
