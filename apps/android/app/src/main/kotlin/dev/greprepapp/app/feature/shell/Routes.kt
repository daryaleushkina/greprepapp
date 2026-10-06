package dev.greprepapp.app.feature.shell

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.navigation3.runtime.NavKey
import dev.greprepapp.app.R
import dev.greprepapp.app.core.session.SignOutReason
import dev.greprepapp.app.feature.today.TodayPlan
import kotlinx.serialization.Serializable

/**
 * Корень приложения: вход или разделы. Ключ разделов несёт номер входа — выход и новый вход заменяют его, и
 * всё, что жило внутри (модели экранов, запросы в пути), уходит вместе со старым ключом.
 */
sealed interface RootKey {
    data class SignIn(
        val reason: SignOutReason?,
    ) : RootKey

    data class Main(
        val sessionId: Long,
    ) : RootKey
}

/** Разделы: «Сегодня · Слова · Экзамен · Прогресс» (PRODUCT.md, «Навигация»); эссе — в «Экзамене». */
enum class AppTab(
    @param:StringRes val label: Int,
    @param:DrawableRes val icon: Int,
    @param:DrawableRes val selectedIcon: Int,
    val tag: String,
) {
    Today(R.string.tab_today, R.drawable.ic_tab_today, R.drawable.ic_tab_today_selected, "tab.today"),
    Words(R.string.tab_words, R.drawable.ic_tab_words, R.drawable.ic_tab_words_selected, "tab.words"),
    Exam(R.string.tab_exam, R.drawable.ic_tab_exam, R.drawable.ic_tab_exam_selected, "tab.exam"),
    Progress(R.string.tab_progress, R.drawable.ic_tab_progress, R.drawable.ic_tab_progress_selected, "tab.progress"),
}

@Serializable
sealed interface TodayRoute : NavKey {
    @Serializable
    data object Root : TodayRoute

    /** Шаг ленты. Сами тренировки и слова — следующие части (ROADMAP §5). */
    @Serializable
    data class Step(
        val step: TodayPlan.Step,
    ) : TodayRoute
}

@Serializable
sealed interface ProgressRoute : NavKey {
    @Serializable
    data object Root : ProgressRoute

    @Serializable
    data object Settings : ProgressRoute
}
