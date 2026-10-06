package dev.greprepapp.app.flow

import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ActivityScenario
import com.github.takahirom.roborazzi.RobolectricDeviceQualifiers
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dagger.hilt.android.testing.HiltTestApplication
import dev.greprepapp.api.models.QuestionReport
import dev.greprepapp.api.models.QuestionType
import dev.greprepapp.api.models.Section
import dev.greprepapp.api.models.StepState
import dev.greprepapp.api.models.TrainingMode
import dev.greprepapp.app.MainActivity
import dev.greprepapp.app.testing.FakeNetwork
import dev.greprepapp.app.testing.Fixtures
import dev.greprepapp.app.testing.ManualTicker
import dev.greprepapp.app.testing.MutableClock
import dev.greprepapp.app.testing.plan
import dev.greprepapp.app.testing.step
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import javax.inject.Inject

/**
 * Тренировка через интерфейс, как её проходит человек: «Сегодня» → конструктор → вопросы с разбором → итог →
 * разбор → «Сообщить об ошибке»; «Проверка» с таймером; без сети; «Продолжить тренировку».
 */
@OptIn(ExperimentalTestApi::class)
@HiltAndroidTest
@RunWith(RobolectricTestRunner::class)
@Config(application = HiltTestApplication::class, qualifiers = "ru-" + RobolectricDeviceQualifiers.MediumPhone)
class TrainingFlowTest {
    @get:Rule(order = 0)
    val hilt = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val compose = createEmptyComposeRule()

    @Inject lateinit var server: FakeServer

    @Inject lateinit var network: FakeNetwork

    @Inject lateinit var clock: MutableClock

    @Inject lateinit var ticker: ManualTicker

    private var scenario: ActivityScenario<MainActivity>? = null

    @Before
    fun setUp() = hilt.inject()

    @After
    fun tearDown() {
        scenario?.close()
    }

    private fun waitFor(tag: String) = compose.waitUntilAtLeastOneExists(hasTestTag(tag), TIMEOUT)

    private fun click(tag: String) {
        waitFor(tag)
        compose.onNodeWithTag(tag).performClick()
    }

    /** Вошёл, открыл «Своя тренировка», дождался конструктора. */
    private fun openBuilder() {
        scenario = ActivityScenario.launch(MainActivity::class.java)
        waitFor("signin.dev.name")
        compose.onNodeWithTag("signin.dev.name").performTextInput("trainee")
        compose.onNodeWithTag("signin.dev.submit").performClick()
        waitFor("today.plan")
        compose.onNodeWithTag("today.plan").performScrollToNode(hasTestTag("today.newTraining"))
        click("today.newTraining")
        waitFor("builder.start")
    }

    private fun answerPractice(vararg options: String) {
        options.forEach { click("option.$it") }
        click("question.check")
        waitFor("explanation")
    }

    @Test
    fun practiceExplainsEachAnswerAndEndsWithWhatToReview() {
        openBuilder()
        // Набор «Проверка на время» есть, но выбрана своя сборка: Verbal · Text Completion · Практика.
        compose.onNodeWithText("Проверка на время").assertIsDisplayed()
        click("builder.start")
        waitFor("question.prompt")
        assertEquals(1, server.starts.size)
        compose.onNodeWithTag("question.check").assertIsNotEnabled()

        // Неверно: вердикт, ключ, второй уровень и английский.
        answerPractice("C")
        compose.onNodeWithTag("explanation.verdict").assertTextEquals("Неверно. Верный ответ — A, equivocal.")
        click("explanation.whyNotToggle")
        compose.onNodeWithText("исчерпывающий", substring = true).assertIsDisplayed()
        compose.onNodeWithText("EN").performClick()
        compose.onNodeWithTag("explanation.verdict").assertTextEquals("Incorrect. The answer is A, equivocal.")
        click("question.next")

        // Sentence Equivalence: «Проверить» — только когда выбраны оба слова.
        click("option.A")
        compose.onNodeWithTag("question.check").assertIsNotEnabled()
        compose.onNodeWithText("Выберите ещё один ответ").assertIsDisplayed()
        answerPractice("C")
        compose.onNodeWithTag("explanation.verdict").assertTextEquals("Correct.")
        click("question.next")

        waitFor("summary")
        compose.onNodeWithTag("summary.correct").assertTextEquals("1")
        compose.onNodeWithText("Слова-сигналы контраста").assertIsDisplayed()
        compose.waitUntil(TIMEOUT) { server.finishes.size == 1 }
        assertEquals(
            listOf(0, 1),
            server.answers
                .flatMap { b -> b.answers.map { it.position } }
                .distinct()
                .sorted(),
        )

        // Разбор: вопрос с ответом и ключом — и жалоба на него.
        click("summary.review")
        click("review.item.0")
        waitFor("reviewItem")
        click("question.report")
        click("report.kind.translation")
        compose.onNodeWithTag("report.text").performTextInput("Опечатка в английском разборе")
        click("report.send")
        waitFor("report.sent")
        compose.waitUntil(TIMEOUT) { server.reports.size == 1 }
        val report = server.reports.single()
        assertEquals(QuestionReport.Kind.TRANSLATION, report.kind)
        assertEquals(Fixtures.session(Fixtures.tc1).id, report.trainingId)
    }

    @Test
    fun checkEndsWhenTimeRunsOut() {
        server.nextSession = Fixtures.session(Fixtures.tc1, Fixtures.tc3, mode = TrainingMode.CHECK)
        openBuilder()
        click("builder.mode.check")
        click("builder.start")
        waitFor("session.timer")
        compose.onNodeWithText("3:00").assertIsDisplayed()
        click("option.A")
        click("question.flag")

        clock.now = clock.now.plusSeconds(181)
        ticker.tick()
        waitFor("summary")
        compose.onNodeWithText("Время вышло — неотвеченные не считаются ошибками темы.").assertIsDisplayed()
        compose.waitUntil(TIMEOUT) { server.finishes.size == 1 }
        assertTrue(server.finishes.single().timedOut)
        assertTrue("отметка ушла вместе с ответом", server.answers.flatMap { it.answers }.any { it.position == 0 && it.flagged })
    }

    @Test
    fun startedTrainingGoesOnWithoutNetworkAndSyncsLater() {
        openBuilder()
        click("builder.start")
        waitFor("question.prompt")

        server.down = true
        network.isOnline.value = false
        answerPractice("A")
        click("question.next")
        answerPractice("A", "C")
        click("question.next")
        waitFor("summary")
        compose.onNodeWithTag("summary.correct").assertTextEquals("2")
        assertTrue(server.finishes.isEmpty())

        server.down = false
        network.isOnline.value = true
        compose.waitUntil(TIMEOUT) { server.finishes.size == 1 }
        assertEquals(setOf(0, 1), server.answers.flatMap { b -> b.answers.map { it.position } }.toSet())
    }

    @Test
    fun todayContinuesTheStartedTrainingOnTheSameQuestion() {
        openBuilder()
        click("builder.start")
        answerPractice("A")
        click("question.next")
        waitFor("question.prompt")
        click("session.close")

        waitFor("today.continue")
        compose.onNodeWithTag("today.continue").assertTextContains("вопрос 2 из 2", substring = true)
        click("today.continue")
        compose.waitUntilAtLeastOneExists(hasText("diplomat", substring = true), TIMEOUT)
    }

    @Test
    fun checkFinishesFromTheQuestionList() {
        server.nextSession = Fixtures.session(Fixtures.tc1, Fixtures.se, mode = TrainingMode.CHECK)
        openBuilder()
        click("builder.mode.check")
        click("builder.start")
        click("option.A")
        click("question.next")
        // Второй вопрос — «Пропустить»: после последнего открывается список вопросов.
        click("session.secondary")
        waitFor("overview")
        click("overview.0")
        waitFor("question.prompt")
        compose.onNodeWithTag("option.A").assertIsSelected()
        click("question.overview")
        click("overview.finish")
        waitFor("summary")
        compose.waitUntil(TIMEOUT) { server.finishes.size == 1 }
        assertEquals(false, server.finishes.single().timedOut)
        assertTrue(server.answers.flatMap { it.answers }.any { it.position == 0 && it.optionIds == listOf("A") })
    }

    @Test
    fun dontKnowCountsAsAMistakeAndRepeatStartsPractice() {
        openBuilder()
        click("builder.start")
        click("question.dontKnow")
        waitFor("explanation")
        compose.onNodeWithTag("explanation.verdict").assertTextEquals("Верный ответ — A, equivocal.")
        click("question.next")
        click("question.dontKnow")
        waitFor("explanation")
        click("question.next")
        waitFor("summary")
        compose.onNodeWithTag("summary.correct").assertTextEquals("0")

        server.nextSession = Fixtures.session(Fixtures.tc1, id = "22222222-0000-4000-8000-000000000002")
        click("summary.repeat")
        waitFor("question.prompt")
        val repeat = server.starts.last()
        assertEquals(TrainingMode.PRACTICE, repeat.mode)
        assertEquals(listOf("contrast-signals", "close-synonyms"), repeat.topicIds)
        assertEquals(5, repeat.count)
    }

    @Test
    fun topicsShapeTheRequest() {
        openBuilder()
        click("builder.topics")
        click("topic.cause-effect")
        compose.onNodeWithTag("topics.done").assertTextEquals("Готово · 3 задания")
        click("topics.done")
        click("builder.start")
        waitFor("question.prompt")
        assertEquals(listOf("contrast-signals"), server.starts.single().topicIds)
    }

    @Test
    fun timedPresetStartsAsItIs() {
        openBuilder()
        click("builder.preset.timed")
        click("builder.start")
        waitFor("question.prompt")
        val request = server.starts.single()
        assertEquals(TrainingMode.CHECK, request.mode)
        assertEquals(setOf(QuestionType.TEXT_COMPLETION, QuestionType.SENTENCE_EQUIVALENCE), request.questionTypes)
        assertEquals(12, request.count)
    }

    @Test
    fun todayQuantStepOpensTheBuilderOnQuant() {
        server.plan = plan(step("q", Section.QUANT, StepState.CURRENT, 10, "Quant: Quantitative Comparison"))
        scenario = ActivityScenario.launch(MainActivity::class.java)
        waitFor("signin.dev.name")
        compose.onNodeWithTag("signin.dev.name").performTextInput("stepper")
        compose.onNodeWithTag("signin.dev.submit").performClick()
        click("today.start")
        waitFor("builder.start")
        compose.onNodeWithTag("builder.section.quant").assertIsSelected()
        compose.onNodeWithTag("builder.type").assertTextContains("Quantitative Comparison", substring = true)
        click("builder.start")
        waitFor("question.prompt")
        assertEquals(Section.QUANT, server.starts.single().section)
    }

    @Test
    fun builderWithoutNetworkSaysSo() {
        openBuilder()
        compose.onNodeWithTag("builder.start").assertIsDisplayed()
        server.down = true
        click("builder.start")
        waitFor("builder.problem")
        compose.onNodeWithText("Нет сети — тренировку не начать. Попробуйте, когда она появится.").assertIsDisplayed()
    }

    private companion object {
        const val TIMEOUT = 10_000L
    }
}
