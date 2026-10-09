package dev.greprepapp.app.flow

import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso
import com.github.takahirom.roborazzi.RobolectricDeviceQualifiers
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dagger.hilt.android.testing.HiltTestApplication
import dev.greprepapp.api.models.Section
import dev.greprepapp.api.models.StepState
import dev.greprepapp.app.MainActivity
import dev.greprepapp.app.feature.today.TodayCache
import dev.greprepapp.app.testing.FakeNetwork
import dev.greprepapp.app.testing.MemoryTokenStore
import dev.greprepapp.app.testing.plan
import dev.greprepapp.app.testing.step
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import javax.inject.Inject

/**
 * Сценарии через интерфейс — как это делает человек: вход, «Сегодня» с данными сервера, шаг, вкладки,
 * настройки, выход; без сети и с истёкшей сессией. Сервер — подменный (FakeServer), всё остальное — настоящее.
 */
@OptIn(ExperimentalTestApi::class)
@HiltAndroidTest
@RunWith(RobolectricTestRunner::class)
@Config(application = HiltTestApplication::class, qualifiers = "ru-" + RobolectricDeviceQualifiers.MediumPhone)
class AppFlowTest {
    @get:Rule(order = 0)
    val hilt = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val compose = createEmptyComposeRule()

    @Inject lateinit var server: FakeServer

    @Inject lateinit var tokens: MemoryTokenStore

    @Inject lateinit var network: FakeNetwork

    @Inject lateinit var cache: TodayCache

    private var scenario: ActivityScenario<MainActivity>? = null

    @Before
    fun setUp() = hilt.inject()

    @After
    fun tearDown() {
        scenario?.close()
    }

    private fun launch() {
        scenario = ActivityScenario.launch(MainActivity::class.java)
    }

    private fun waitFor(
        tag: String,
        timeout: Long = TIMEOUT,
    ) = compose.waitUntilAtLeastOneExists(hasTestTag(tag), timeout)

    private fun waitForText(text: String) = compose.waitUntilAtLeastOneExists(hasText(text), TIMEOUT)

    private fun signIn(name: String = "anna") {
        waitFor("signin.dev.name")
        compose.onNodeWithTag("signin.dev.name").performTextInput(name)
        compose.onNodeWithTag("signin.dev.submit").performClick()
    }

    @Test
    @Config(qualifiers = "en-" + RobolectricDeviceQualifiers.MediumPhone)
    fun settingsShowTheSameDisclaimerInEnglish() = settingsShowTheEnglishEtsDisclaimer()

    @Test
    fun settingsShowTheEnglishEtsDisclaimer() {
        launch()
        signIn()
        waitFor("today.plan")
        compose.onNodeWithTag("tab.progress").performClick()
        compose.onNodeWithTag("progress.settings").performClick()
        compose
            .onNodeWithText(
                "GRE® is a registered trademark of Educational Testing Service (ETS). This product is not endorsed or approved by ETS.",
            ).assertIsDisplayed()
    }

    @Test
    fun signInShowsTodayFromTheServerAndSignOutReturns() {
        launch()
        signIn()
        waitForText("Слова: повторение")
        compose.onNodeWithTag("today.summary").assertTextEquals("Три шага · около 25 минут")
        assertEquals("tok-anna-1", tokens.token)

        // Шаг открывается, «Назад» возвращает к ленте.
        compose.onNodeWithTag("today.start").performClick()
        waitFor("step.placeholder")
        compose.onNodeWithContentDescription("Назад").performClick()
        waitFor("today.plan")

        // Настройки — в «Прогрессе»; выход — сразу на экран входа, сервер узнаёт следом.
        compose.onNodeWithTag("tab.progress").performClick()
        waitFor("progress.empty")
        compose.onNodeWithTag("progress.settings").performClick()
        waitFor("settings.signOut")
        compose.onNodeWithText("Версия 0.1.0 (1)").assertIsDisplayed()
        compose.onNodeWithTag("settings.signOut").performClick()
        waitFor("signin.telegram")
        compose.waitUntil(TIMEOUT) { server.signedOutTokens.contains("tok-anna-1") }
        assertNull(tokens.token)
        assertNull("план вышедшего не остаётся на устройстве", cache.load())
    }

    @Test
    fun savedSessionOpensTodayWithoutSignIn() {
        server.issue("saved")
        tokens.token = "saved"
        launch()
        waitForText("Verbal: Text Completion")
    }

    @Test
    fun expiredSessionReturnsToSignInAndSaysWhy() {
        tokens.token = "gone"
        launch()
        waitFor("signin.expired")
        assertNull(tokens.token)
    }

    @Test
    fun offlineKeepsYesterdaysPlanAndUpdatesWhenNetworkReturns() {
        launch()
        signIn()
        waitForText("Слова: повторение")

        // Сеть пропала: план остаётся, шаг не начать — рядом объяснение.
        server.down = true
        network.isOnline.value = false
        server.plan = plan(step("q", Section.QUANT, StepState.CURRENT, 15, "Quant: Data Interpretation"))
        compose.onNodeWithTag("today.start").performClick()
        waitFor("today.needsNetwork")

        // Вернулась — план обновился сам, объяснение ушло.
        server.down = false
        network.isOnline.value = true
        waitForText("Quant: Data Interpretation")
        compose.onNodeWithTag("today.needsNetwork").assertDoesNotExistNow()
    }

    @Test
    fun noPlanAndNoNetworkThenRetry() {
        server.issue("saved")
        tokens.token = "saved"
        server.down = true
        launch()
        waitFor("today.unavailable")
        compose.onNodeWithText("Нет сети").assertIsDisplayed()
        server.down = false
        compose.onNodeWithText("Повторить").performClick()
        waitForText("Слова: повторение")
    }

    @Test
    fun providersWithoutAccountsSayNotConnectedYet() {
        launch()
        waitFor("signin.telegram")
        compose.onNodeWithTag("signin.telegram").performClick()
        compose.onNodeWithText("Вход через Telegram ещё не подключён — он появится до беты.").assertIsDisplayed()
        compose.onNodeWithTag("signin.google").performClick()
        compose.onNodeWithText("Вход через Google ещё не подключён — он появится до беты.").assertIsDisplayed()
    }

    @Test
    fun backFromAnotherTabGoesToToday() {
        server.issue("saved")
        tokens.token = "saved"
        launch()
        waitFor("today.plan")
        compose.onNodeWithTag("tab.words").performClick()
        waitFor("words.placeholder")
        Espresso.pressBack()
        waitFor("today.plan")
        compose.onNodeWithTag("tab.exam").performClick()
        waitFor("exam.placeholder")
    }

    @Test
    fun tappingTheCurrentTabReturnsToItsStart() {
        server.issue("saved")
        tokens.token = "saved"
        launch()
        waitFor("today.plan")
        compose.onNodeWithTag("tab.progress").performClick()
        waitFor("progress.settings")
        compose.onNodeWithTag("progress.settings").performClick()
        waitFor("settings.signOut")
        compose.onNodeWithTag("tab.progress").performClick()
        waitFor("progress.empty")
        compose.onNodeWithTag("settings.signOut").assertDoesNotExist()
    }

    private fun androidx.compose.ui.test.SemanticsNodeInteraction.assertDoesNotExistNow() = assertDoesNotExist()

    private companion object {
        const val TIMEOUT = 5_000L
    }
}
