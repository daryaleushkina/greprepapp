package dev.greprepapp.app.feature.today

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import dev.greprepapp.api.models.StepState
import dev.greprepapp.app.testing.plan
import dev.greprepapp.app.testing.starterPlan
import dev.greprepapp.app.testing.step
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
class TodaySummaryTest {
    private val resources get() = ApplicationProvider.getApplicationContext<Context>().resources

    @Test
    @Config(qualifiers = "ru")
    fun russianUsesWordsForStepsAndCasesForMinutes() {
        assertEquals("Три шага · около 25 минут", TodaySummary.text(resources, TodayPlan.from(starterPlan)))
        assertEquals("Один шаг · около 1 минуты", TodaySummary.text(resources, TodayPlan.from(plan(step("a", minutes = 1)))))
        assertEquals(
            "Два шага · около 22 минут",
            TodaySummary.text(resources, TodayPlan.from(plan(step("a", minutes = 11), step("b", minutes = 11)))),
        )
    }

    @Test
    @Config(qualifiers = "ru")
    fun finishedDayIsNotApproximate() {
        val done = plan(step("a", state = StepState.DONE, minutes = 21))
        assertEquals("Один шаг · 21 минута", TodaySummary.text(resources, TodayPlan.from(done)))
    }

    @Test
    @Config(qualifiers = "ru")
    fun emptyPlanIsNotZeroSteps() {
        assertEquals("На сегодня шагов нет", TodaySummary.text(resources, TodayPlan.from(plan())))
    }

    @Test
    @Config(qualifiers = "ru")
    fun moreStepsThanWordsFallBackToNumbers() {
        assertEquals("Восемь шагов", TodaySummary.stepCount(resources, 8))
        assertEquals("9 шагов", TodaySummary.stepCount(resources, 9))
        assertEquals("22 шага", TodaySummary.stepCount(resources, 22))
    }

    @Test
    @Config(qualifiers = "en")
    fun englishReadsNaturally() {
        assertEquals("Three steps · about 25 minutes", TodaySummary.text(resources, TodayPlan.from(starterPlan)))
        assertEquals("One step · about 1 minute", TodaySummary.text(resources, TodayPlan.from(plan(step("a", minutes = 1)))))
    }
}
