package dev.greprepapp.app.feature.shell

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.navigation3.runtime.NavKey
import dev.greprepapp.api.models.QuestionType
import dev.greprepapp.app.R
import dev.greprepapp.app.core.session.SignOutReason
import dev.greprepapp.app.feature.today.TodayPlan
import dev.greprepapp.app.feature.training.BuilderPrefill
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

/**
 * Внутри входа: разделы с вкладками — первым, тренировка — поверх них. Внутри тренировки вкладок нет, только
 * одна нижняя кнопка (PRODUCT.md, «Навигация»).
 */
@Serializable
sealed interface MainRoute : NavKey {
    @Serializable
    data object Tabs : MainRoute

    @Serializable
    data class Builder(
        val prefill: BuilderPrefill? = null,
    ) : MainRoute

    @Serializable
    data class Session(
        val trainingId: String,
    ) : MainRoute

    @Serializable
    data class Review(
        val trainingId: String,
    ) : MainRoute

    @Serializable
    data class ReviewItem(
        val trainingId: String,
        val position: Int,
    ) : MainRoute

    @Serializable
    data class Report(
        val trainingId: String,
        val position: Int,
        val questionId: String,
        val questionType: QuestionType,
    ) : MainRoute
}

/**
 * «Назад» внутри входа: корень (вкладки) не снимается. Второе нажатие на стрелку, пока уходящий экран ещё на
 * месте (переход), иначе опустошило бы стопку — а NavDisplay с пустой стопкой падает.
 */
fun MutableList<NavKey>.popUnlessRoot() {
    if (size > 1) removeAt(lastIndex)
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

    /** Шаг ленты без своего экрана (слова — следующая часть, ROADMAP §5); тренировки — MainRoute. */
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
