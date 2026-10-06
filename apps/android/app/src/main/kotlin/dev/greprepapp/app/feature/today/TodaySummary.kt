package dev.greprepapp.app.feature.today

import android.content.res.Resources
import dev.greprepapp.app.R

/**
 * Строка под заголовком: «Три шага · около 22 минут». Число шагов — словом, как в макете: при трёх-четырёх
 * шагах слово читается быстрее цифры; минуты — числом, с русскими падежами из ресурсов.
 */
object TodaySummary {
    private val stepWords =
        intArrayOf(
            R.string.today_steps_1,
            R.string.today_steps_2,
            R.string.today_steps_3,
            R.string.today_steps_4,
            R.string.today_steps_5,
            R.string.today_steps_6,
            R.string.today_steps_7,
            R.string.today_steps_8,
        )

    fun text(
        resources: Resources,
        plan: TodayPlan,
    ): String {
        // Договор допускает пустой план; «0 шагов · около 0 минут» — бессмыслица.
        if (plan.steps.isEmpty()) return resources.getString(R.string.today_no_steps)
        val total = plan.totalMinutes
        val minutes =
            if (plan.isComplete) {
                resources.getQuantityString(R.plurals.today_minutes, total, total)
            } else {
                resources.getQuantityString(R.plurals.today_minutes_about, total, total)
            }
        return resources.getString(R.string.today_summary, stepCount(resources, plan.steps.size), minutes)
    }

    /** Шагов в плане не больше восьми (договор, Today.steps.maxItems); больше — числом. */
    fun stepCount(
        resources: Resources,
        count: Int,
    ): String =
        stepWords.getOrNull(count - 1)?.let(resources::getString)
            ?: resources.getQuantityString(R.plurals.today_steps, count, count)
}
