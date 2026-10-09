package dev.greprepapp.app.flow

import androidx.compose.ui.input.key.Key
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.pressKey
import androidx.test.core.app.ActivityScenario
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dagger.hilt.android.testing.HiltTestApplication
import dev.greprepapp.api.models.TrainingMode
import dev.greprepapp.app.MainActivity
import dev.greprepapp.app.testing.Fixtures
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import javax.inject.Inject

@OptIn(ExperimentalTestApi::class)
@HiltAndroidTest
@RunWith(RobolectricTestRunner::class)
@Config(application = HiltTestApplication::class, qualifiers = "ru-w1000dp-h800dp-land-mdpi-keysexposed-qwerty")
class TabletTrainingFlowTest {
    @get:Rule(order = 0)
    val hilt = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val compose = createEmptyComposeRule()

    @Inject lateinit var server: FakeServer
    private var scenario: ActivityScenario<MainActivity>? = null

    @Before fun setUp() = hilt.inject()

    @After fun tearDown() {
        scenario?.close()
    }

    private fun waitFor(tag: String) = compose.waitUntilAtLeastOneExists(hasTestTag(tag), 10_000)

    private fun click(tag: String) {
        waitFor(tag)
        compose.onNodeWithTag(tag).performClick()
    }

    private fun key(key: Key) {
        compose.onRoot().performKeyInput { pressKey(key) }
    }

    private fun openBuilder() {
        scenario = ActivityScenario.launch(MainActivity::class.java)
        waitFor("signin.dev.name")
        compose.onNodeWithTag("signin.dev.name").performTextInput("tablet")
        click("signin.dev.submit")
        waitFor("today.plan")
        compose.onNodeWithTag("today.plan").performScrollToNode(hasTestTag("today.newTraining"))
        click("today.newTraining")
        waitFor("builder.start")
    }

    @Test fun builderAndExplanationUseTwoColumns() {
        openBuilder()
        val preset = compose.onNodeWithTag("builder.preset.timed").fetchSemanticsNode().boundsInRoot
        val form = compose.onNodeWithTag("builder.type").fetchSemanticsNode().boundsInRoot
        assertTrue("готовые наборы слева, своя сборка справа", preset.right <= form.left)
        key(Key.Enter)
        click("option.C")
        click("question.check")
        waitFor("explanation")
        val question = compose.onNodeWithTag("question.prompt").fetchSemanticsNode().boundsInRoot
        val explanation = compose.onNodeWithTag("explanation").fetchSemanticsNode().boundsInRoot
        assertTrue("вопрос и разбор рядом", question.right <= explanation.left)
    }

    @Test fun keyboardChoosesAllSeOptionsAndNavigatesReviewInPlace() {
        server.nextSession = Fixtures.session(Fixtures.se, Fixtures.tc3)
        openBuilder()
        click("builder.start")
        waitFor("question.prompt")
        key(Key.F)
        compose.onNodeWithTag("option.F").assertIsSelected()
        key(Key.F)
        key(Key.A)
        key(Key.C)
        key(Key.Enter)
        waitFor("explanation")
        key(Key.DirectionRight)
        waitFor("option.D")
        key(Key.A)
        key(Key.A)
        key(Key.A)
        compose.onNodeWithTag("option.A").assertIsSelected()
        compose.onNodeWithTag("option.D").assertIsSelected()
        compose.onNodeWithTag("option.G").assertIsSelected()
        key(Key.Enter)
        waitFor("explanation")
        key(Key.DirectionRight)
        waitFor("summary")
        click("summary.review")
        click("review.item.0")
        compose.onNodeWithTag("review.list").assertIsDisplayed()
        compose.onNodeWithTag("question.prompt").assertIsDisplayed()
        key(Key.DirectionDown)
        waitFor("option.G")
        compose.onNodeWithTag("review.list").assertIsDisplayed()
    }

    @Test
    @Config(qualifiers = "ru-w899dp-h800dp-land-mdpi-keyshidden-nokeys")
    fun smallerWindowKeepsTheCenteredPhoneLayoutWithoutKeyHints() {
        openBuilder()
        val preset = compose.onNodeWithTag("builder.preset.timed").fetchSemanticsNode().boundsInRoot
        val form = compose.onNodeWithTag("builder.type").fetchSemanticsNode().boundsInRoot
        assertTrue(preset.bottom <= form.top)
        compose.onNodeWithText("Enter").assertDoesNotExist()
        click("builder.start")
        click("option.C")
        click("question.check")
        waitFor("explanation")
        val question = compose.onNodeWithTag("question.prompt").fetchSemanticsNode().boundsInRoot
        val explanation = compose.onNodeWithTag("explanation").fetchSemanticsNode().boundsInRoot
        assertTrue(question.bottom <= explanation.top)
    }

    @Test
    @Config(qualifiers = "ru-w900dp-h800dp-land-mdpi-keyshidden-nokeys")
    fun twoColumnsStartAtExactlyNineHundredDpAndTopicsReturnToBuilder() {
        openBuilder()
        compose.onNodeWithTag("builder.split").assertIsDisplayed()
        click("builder.topics")
        compose.onNodeWithTag("topics.split").assertIsDisplayed()
        click("topics.difficulty.medium")
        click("topics.done")
        compose.onNodeWithTag("builder.split").assertIsDisplayed()
        compose.onNodeWithText("Enter").assertDoesNotExist()
    }

    @Test fun timedQuestionShowsTheListAlongsideIt() {
        server.nextSession = Fixtures.session(Fixtures.tc1, Fixtures.se, mode = TrainingMode.CHECK)
        openBuilder()
        click("builder.mode.check")
        click("builder.start")
        waitFor("question.prompt")
        compose.onNodeWithTag("overview.1").assertIsDisplayed()
        click("overview.1")
        compose.onNodeWithTag("option.F").assertIsDisplayed()
        compose.onNodeWithTag("overview.0").assertIsDisplayed()
    }
}
