package dev.greprepapp.app.flow

import androidx.activity.compose.setContent
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.input.InputMode
import androidx.compose.ui.input.InputModeManager
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.LocalInputModeManager
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.pressKey
import androidx.test.core.app.ActivityScenario
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dagger.hilt.android.testing.HiltTestApplication
import dev.greprepapp.api.models.TrainingMode
import dev.greprepapp.app.AppRoot
import dev.greprepapp.app.MainActivity
import dev.greprepapp.app.testing.Fixtures
import dev.greprepapp.design.GpTheme
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

    @Inject lateinit var clock: dev.greprepapp.app.testing.MutableClock

    @Inject lateinit var ticker: dev.greprepapp.app.testing.ManualTicker
    private var scenario: ActivityScenario<MainActivity>? = null
    private lateinit var inputMode: InputModeManager

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
        scenario?.onActivity { activity ->
            activity.setContent {
                val manager = LocalInputModeManager.current
                SideEffect { inputMode = manager }
                GpTheme { AppRoot(session = activity.session, config = activity.config) }
            }
        }
        waitFor("signin.dev.name")
        compose.onNodeWithTag("signin.dev.name").performTextInput("tablet")
        click("signin.dev.submit")
        waitFor("today.plan")
        compose.onNodeWithTag("today.plan").performScrollToNode(hasTestTag("today.newTraining"))
        click("today.newTraining")
        waitFor("builder.start")
    }

    private fun focus(tag: String) {
        compose.runOnIdle { inputMode.requestInputMode(InputMode.Keyboard) }
        compose.onNodeWithTag(tag).performSemanticsAction(SemanticsActions.RequestFocus) { it() }
        compose.onNodeWithTag(tag).assertIsFocused()
    }

    private fun openLongReview() {
        server.nextSession = Fixtures.session(*Array(40) { Fixtures.tc1 }, mode = TrainingMode.CHECK)
        openBuilder()
        click("builder.mode.check")
        click("builder.start")
        waitFor("question.prompt")
        clock.now = clock.now.plusSeconds(4000)
        ticker.tick()
        waitFor("summary")
        click("summary.review")
        waitFor("review.list")
    }

    @Test
    fun enterActivatesTheFocusedReportButtonInsteadOfCheckingTheAnswer() {
        openBuilder()
        click("builder.start")
        click("option.A")
        focus("question.report")
        key(Key.Enter)
        waitFor("report.text")
        compose.onNodeWithTag("report.text").assertIsDisplayed()
    }

    @Test
    fun enterActivatesTheFocusedFilterAndReportButtonInWideReview() {
        openLongReview()
        focus("review.filter.mistakes")
        key(Key.Enter)
        compose.onNodeWithTag("review.filter.mistakes").assertIsSelected()
        focus("question.report")
        key(Key.Enter)
        waitFor("report.text")
    }

    @Test
    fun selectingAnOffscreenRowBelowBringsItToTheNearestEdge() {
        openLongReview()
        compose.onNodeWithTag("review.list").performScrollToNode(hasTestTag("review.item.20"))
        click("review.item.20")
        compose.waitForIdle()
        compose.onNodeWithText("Вопрос 21").assertIsDisplayed()
        compose.onNodeWithTag("review.list").performScrollToNode(hasTestTag("review.filter.all"))
        compose.onNodeWithTag("review.filter.all").assertIsDisplayed()
        focus("training.keyboard")
        key(Key.DirectionDown)
        compose.waitUntilAtLeastOneExists(
            androidx.compose.ui.test
                .hasText("Вопрос 22"),
            10_000,
        )
        waitFor("review.item.21")
        compose.onNodeWithTag("review.item.21").assertIsDisplayed()
        compose.onNodeWithTag("review.item.20").assertIsDisplayed()
    }

    @Test
    fun selectingAVisibleReviewRowDoesNotMoveItToTheTop() {
        openLongReview()
        compose.onNodeWithTag("review.list").performScrollToNode(hasTestTag("review.item.5"))
        val before =
            compose
                .onNodeWithTag("review.item.5")
                .fetchSemanticsNode()
                .boundsInRoot.top
        click("review.item.5")
        compose.waitForIdle()
        val after =
            compose
                .onNodeWithTag("review.item.5")
                .fetchSemanticsNode()
                .boundsInRoot.top
        assertEquals(before, after, 1f)
    }

    @Test
    @Config(qualifiers = "ru-w899dp-h800dp-land-mdpi-keysexposed-qwerty")
    fun narrowReviewDoesNotShowOrUseAnInvisibleKeyboardSelection() {
        openLongReview()
        compose.onNodeWithText("↑ / ↓").assertDoesNotExist()
        key(Key.DirectionDown)
        focus("training.keyboard")
        key(Key.Enter)
        compose.onNodeWithTag("review.list").assertIsDisplayed()
        compose.onNodeWithTag("reviewItem").assertDoesNotExist()
    }

    @Test
    @Config(qualifiers = "ru-w899dp-h800dp-land-mdpi-keyshidden-nokeys")
    fun narrowReviewKeepsItsScrollPositionWhenReturningFromAQuestion() {
        openLongReview()
        compose.onNodeWithTag("review.list").performScrollToNode(hasTestTag("review.item.30"))
        click("review.item.30")
        waitFor("reviewItem")
        androidx.test.espresso.Espresso
            .pressBack()
        waitFor("review.list")
        compose.onNodeWithTag("review.item.30").assertIsDisplayed()
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
