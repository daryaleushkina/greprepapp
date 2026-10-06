package dev.greprepapp.api

import dev.greprepapp.api.models.ClientError
import dev.greprepapp.api.models.ClientKind
import dev.greprepapp.api.models.DevSignIn
import dev.greprepapp.api.models.Section
import dev.greprepapp.api.models.SessionTransport
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.SocketEffect
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Duration

class ApiCallTest {
    private val server = MockWebServer()
    private lateinit var api: GrePrepApi

    @Before
    fun setUp() {
        server.start()
        api = GrePrepApi(server.url("/"), OkHttpClient.Builder().callTimeout(Duration.ofSeconds(5)).build())
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun json(
        code: Int,
        body: String,
        requestId: String? = null,
    ): MockResponse {
        val builder =
            MockResponse
                .Builder()
                .code(code)
                .addHeader("Content-Type", "application/json")
                .body(body)
        if (requestId != null) builder.addHeader("X-Request-Id", requestId)
        return builder.build()
    }

    @Test
    fun okResponseIsDecodedAndUnknownFieldsAreSkipped() =
        runTest {
            // Сервер обновляется раньше приложения: новое поле не должно ломать установленные версии.
            server.enqueue(
                json(
                    200,
                    """{"date":"2026-10-06","steps":[{"id":"w","section":"words","title":"Слова","minutes":5,""" +
                        """"state":"current","extra":true}],"newField":{"a":1}}""",
                ),
            )
            val result = apiCall { api.today.getToday() }
            result as ApiResult.Ok
            assertEquals(
                Section.WORDS,
                result.value.steps
                    .single()
                    .section,
            )
        }

    @Test
    fun missingRequiredFieldIsUnexpectedNotEmptySuccess() =
        runTest {
            server.enqueue(json(200, """{"date":"2026-10-06"}"""))
            val result = apiCall { api.today.getToday() }
            assertTrue(result is ApiResult.Failed && result.failure is ApiFailure.Unexpected)
        }

    @Test
    fun unauthorizedMeansSessionIsGone() =
        runTest {
            server.enqueue(json(401, """{"code":"unauthorized","message":"no session","requestId":"r1"}"""))
            assertEquals(ApiResult.Failed(ApiFailure.Unauthorized), apiCall { api.today.getToday() })
        }

    @Test
    fun proxyWithoutServerIsOffline() =
        runTest {
            for (status in listOf(502, 503, 504)) {
                server.enqueue(
                    MockResponse
                        .Builder()
                        .code(status)
                        .body("<html>Bad Gateway</html>")
                        .build(),
                )
                assertEquals(ApiResult.Failed(ApiFailure.Offline), apiCall { api.today.getToday() })
            }
        }

    @Test
    fun contractErrorCarriesCodeAndRequestId() =
        runTest {
            server.enqueue(json(429, """{"code":"too_many_requests","message":"slow down","requestId":"req-9"}"""))
            assertEquals(
                ApiResult.Failed(ApiFailure.Server(429, "too_many_requests", "req-9")),
                apiCall { api.today.getToday() },
            )
        }

    @Test
    fun errorWithoutContractBodyFallsBackToStatusAndHeader() =
        runTest {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(500)
                    .addHeader("X-Request-Id", "hdr-1")
                    .body("oops")
                    .build(),
            )
            val failure = (apiCall { api.today.getToday() } as ApiResult.Failed).failure
            assertEquals(ApiFailure.Server(500, "http_500", "hdr-1"), failure)
            assertTrue(failure.isReportable)
        }

    @Test
    fun clientErrorsAreNotReportedButServerFailuresAre() {
        assertFalse(ApiFailure.Offline.isReportable)
        assertFalse(ApiFailure.Unauthorized.isReportable)
        assertFalse(ApiFailure.Server(400, "bad_request", null).isReportable)
        assertTrue(ApiFailure.Server(503, "internal", null).isReportable)
        assertTrue(ApiFailure.Unexpected("x").isReportable)
    }

    @Test
    fun brokenConnectionIsOffline() =
        runTest {
            server.enqueue(MockResponse.Builder().onRequestStart(SocketEffect.CloseSocket()).build())
            assertEquals(ApiResult.Failed(ApiFailure.Offline), apiCall { api.today.getToday() })
        }

    @Test
    fun truncatedSuccessBodyIsOfflineNotEmptySuccess() =
        runTest {
            // 200 с оборванным телом — сбой сети, а не пустой успех (docs/HANDOFF.md, «Клиент»).
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(200)
                    .addHeader("Content-Type", "application/json")
                    .addHeader("Content-Length", "500")
                    .body("""{"date":"2026-10-06","steps":[""")
                    .onResponseBody(SocketEffect.ShutdownConnection)
                    .build(),
            )
            assertEquals(ApiResult.Failed(ApiFailure.Offline), apiCall { api.today.getToday() })
        }

    @Test
    fun unreachableServerIsOffline() =
        runTest {
            val url = server.url("/")
            server.close()
            val closed = GrePrepApi(url, OkHttpClient())
            assertEquals(ApiResult.Failed(ApiFailure.Offline), apiCall { closed.today.getToday() })
        }

    @Test
    fun requestsOmitAbsentOptionalFields() =
        runTest {
            // Сервер (ogen) отклоняет null вместо отсутствующего поля и лишние поля.
            server.enqueue(MockResponse.Builder().code(204).build())
            apiCallNoContent {
                api.public.reportClientError(
                    ClientError(message = "m", clientKind = ClientKind.ANDROID, appVersion = "1", occurredAt = "t"),
                )
            }
            val body = server.takeRequest().body!!.utf8()
            assertEquals("""{"message":"m","clientKind":"android","appVersion":"1","occurredAt":"t"}""", body)
        }

    @Test
    fun enumsAreSentAsContractValues() =
        runTest {
            server.enqueue(json(500, "{}"))
            apiCall { api.auth.signInForDevelopment(DevSignIn(name = "a", transport = SessionTransport.BEARER)) }
            assertEquals("""{"name":"a","transport":"bearer"}""", server.takeRequest().body!!.utf8())
        }
}
