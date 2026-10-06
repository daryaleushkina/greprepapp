package dev.greprepapp.app.feature.shell

import androidx.activity.compose.BackHandler
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteDefaults
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import dev.greprepapp.api.models.Section
import dev.greprepapp.app.R
import dev.greprepapp.app.feature.today.TodayContent
import dev.greprepapp.app.feature.today.TodayPlan
import dev.greprepapp.app.feature.today.TodayViewModel
import dev.greprepapp.app.feature.training.ActiveTrainingViewModel
import dev.greprepapp.app.feature.training.BuilderPrefill
import dev.greprepapp.app.feature.training.BuilderScreen
import dev.greprepapp.app.feature.training.ReportScreen
import dev.greprepapp.app.feature.training.ReportTarget
import dev.greprepapp.app.feature.training.ReviewItemScreen
import dev.greprepapp.app.feature.training.ReviewScreen
import dev.greprepapp.app.feature.training.SessionScreen
import dev.greprepapp.app.feature.training.label
import dev.greprepapp.design.Gp
import dev.greprepapp.design.StudySection

/**
 * Разделы приложения. Навигация — Material по ширине окна (DESIGN.md, «Нативные приложения»): на телефоне —
 * нижняя панель, на планшете и развёрнутом складном — боковая (NavigationSuiteScaffold решает сам). У
 * «Сегодня» и «Прогресса» своя стопка экранов; повторное нажатие вкладки возвращает к её началу.
 */
@Composable
fun MainScreen(
    appVersion: String,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
    // Модель «Сегодня» живёт, пока человек вошёл, и переживает переключение вкладок.
    today: TodayViewModel = hiltViewModel(),
    trainings: ActiveTrainingViewModel = hiltViewModel(),
) {
    val state by today.state.collectAsStateWithLifecycle()
    val active by trainings.active.collectAsStateWithLifecycle()
    val stack = rememberNavBackStack(MainRoute.Tabs)

    fun back() {
        stack.removeLastOrNull()
    }

    fun replaceTop(route: MainRoute) {
        stack.removeLastOrNull()
        stack.add(route)
    }

    fun toTabs() {
        while (stack.size > 1) stack.removeLastOrNull()
    }
    NavDisplay(
        backStack = stack,
        onBack = ::back,
        modifier = modifier,
        entryDecorators = listOf(rememberSaveableStateHolderNavEntryDecorator(), rememberViewModelStoreNavEntryDecorator()),
        entryProvider =
            entryProvider {
                entry<MainRoute.Tabs> {
                    MainScaffold(
                        appVersion = appVersion,
                        onSignOut = onSignOut,
                        today = { onOpenStep ->
                            TodayContent(
                                state = state,
                                onRefresh = today::refresh,
                                onSelect = { step ->
                                    if (today.canStart(step)) {
                                        // Шаги Verbal и Quant — тренировки: конструктор уже на нужном разделе.
                                        val section = step.section.trainingSection()
                                        if (section != null) stack.add(MainRoute.Builder(BuilderPrefill(section))) else onOpenStep(step)
                                    }
                                },
                                continueTraining = active,
                                onContinueTraining = { stack.add(MainRoute.Session(it)) },
                                onNewTraining = { stack.add(MainRoute.Builder()) },
                            )
                        },
                    )
                }
                entry<MainRoute.Builder> { route ->
                    BuilderScreen(
                        prefill = route.prefill,
                        onBack = ::back,
                        onStarted = { replaceTop(MainRoute.Session(it)) },
                    )
                }
                entry<MainRoute.Session> { route ->
                    SessionScreen(
                        trainingId = route.trainingId,
                        onClose = ::toTabs,
                        onReview = { stack.add(MainRoute.Review(route.trainingId)) },
                        onReport = { stack.add(it.route()) },
                        onRepeatStarted = { replaceTop(MainRoute.Session(it)) },
                    )
                }
                entry<MainRoute.Review> { route ->
                    ReviewScreen(
                        trainingId = route.trainingId,
                        onBack = ::back,
                        onOpen = { stack.add(MainRoute.ReviewItem(route.trainingId, it)) },
                    )
                }
                entry<MainRoute.ReviewItem> { route ->
                    ReviewItemScreen(
                        trainingId = route.trainingId,
                        position = route.position,
                        onBack = ::back,
                        onReport = { stack.add(it.route()) },
                    )
                }
                entry<MainRoute.Report> { route ->
                    ReportScreen(
                        questionId = route.questionId,
                        trainingId = route.trainingId,
                        position = route.position,
                        typeLabel = route.questionType.label(),
                        onBack = ::back,
                    )
                }
            },
    )
}

private fun ReportTarget.route() = MainRoute.Report(trainingId, position, questionId, questionType)

/** Раздел тренировки для шага «Сегодня»; у слов и эссе тренировок нет. */
private fun StudySection.trainingSection(): Section? =
    when (this) {
        StudySection.Verbal -> Section.VERBAL
        StudySection.Quant -> Section.QUANT
        StudySection.Words, StudySection.Essay -> null
    }

/** Вкладки и стопки экранов; «Сегодня» — слотом, чтобы снимки экранов подставляли готовое состояние. */
@Composable
fun MainScaffold(
    appVersion: String,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
    initialTab: AppTab = AppTab.Today,
    today: @Composable (onOpenStep: (TodayPlan.Step) -> Unit) -> Unit,
) {
    var tab by rememberSaveable { mutableStateOf(initialTab) }
    val todayStack = rememberNavBackStack(TodayRoute.Root)
    val progressStack = rememberNavBackStack(ProgressRoute.Root)
    // Состояние экранов (прокрутка) — над вкладками: переключился и вернулся — лента на том же месте.
    val saveable = rememberSaveableStateHolderNavEntryDecorator<NavKey>()

    fun stackOf(item: AppTab): NavBackStack<NavKey>? =
        when (item) {
            AppTab.Today -> todayStack
            AppTab.Progress -> progressStack
            AppTab.Words, AppTab.Exam -> null
        }

    // «Назад» в корне не первой вкладки — на «Сегодня», как принято в Material; в корне «Сегодня» — выход.
    BackHandler(enabled = tab != AppTab.Today && (stackOf(tab)?.size ?: 1) <= 1) {
        tab = AppTab.Today
    }

    val itemColors = navigationColors()
    NavigationSuiteScaffold(
        navigationSuiteItems = {
            AppTab.entries.forEach { item ->
                val selected = item == tab
                item(
                    selected = selected,
                    onClick = {
                        if (selected) stackOf(item)?.popToRoot() else tab = item
                    },
                    icon = {
                        Icon(
                            painter = painterResource(if (selected) item.selectedIcon else item.icon),
                            contentDescription = null,
                        )
                    },
                    label = { Text(stringResource(item.label)) },
                    colors = itemColors,
                    modifier = Modifier.testTag(item.tag),
                )
            }
        },
        navigationSuiteColors =
            NavigationSuiteDefaults.colors(
                navigationBarContainerColor = Gp.colors.surface,
                navigationRailContainerColor = Gp.colors.bg,
            ),
        containerColor = Gp.colors.bg,
        modifier = modifier,
    ) {
        when (tab) {
            AppTab.Today -> {
                NavDisplay(
                    backStack = todayStack,
                    onBack = { todayStack.removeLastOrNull() },
                    entryDecorators = listOf(saveable),
                    entryProvider =
                        entryProvider {
                            entry<TodayRoute.Root> {
                                today { step -> todayStack.add(TodayRoute.Step(step)) }
                            }
                            entry<TodayRoute.Step> { route ->
                                StepPlaceholderScreen(step = route.step, onBack = { todayStack.removeLastOrNull() })
                            }
                        },
                )
            }

            AppTab.Words -> {
                SectionPlaceholderScreen(
                    title = stringResource(R.string.tab_words),
                    message = stringResource(R.string.placeholder_words),
                    tag = "words.placeholder",
                )
            }

            AppTab.Exam -> {
                SectionPlaceholderScreen(
                    title = stringResource(R.string.tab_exam),
                    message = stringResource(R.string.placeholder_exam),
                    tag = "exam.placeholder",
                )
            }

            AppTab.Progress -> {
                NavDisplay(
                    backStack = progressStack,
                    onBack = { progressStack.removeLastOrNull() },
                    entryDecorators = listOf(saveable),
                    entryProvider =
                        entryProvider {
                            entry<ProgressRoute.Root> {
                                ProgressScreen(onOpenSettings = { progressStack.add(ProgressRoute.Settings) })
                            }
                            entry<ProgressRoute.Settings> {
                                SettingsScreen(
                                    appVersion = appVersion,
                                    onSignOut = onSignOut,
                                    onBack = { progressStack.removeLastOrNull() },
                                )
                            }
                        },
                )
            }
        }
    }
}

private fun NavBackStack<NavKey>.popToRoot() {
    while (size > 1) removeLastOrNull()
}

/** Выбранная вкладка — цветом текста на подложке tab-selected, а не системным акцентом: один акцент на всё. */
@Composable
private fun navigationColors() =
    NavigationSuiteDefaults.itemColors(
        navigationBarItemColors =
            NavigationBarItemDefaults.colors(
                selectedIconColor = Gp.colors.text,
                selectedTextColor = Gp.colors.text,
                indicatorColor = Gp.colors.tabSelected,
                unselectedIconColor = Gp.colors.textSecondary,
                unselectedTextColor = Gp.colors.textSecondary,
            ),
        navigationRailItemColors =
            NavigationRailItemDefaults.colors(
                selectedIconColor = Gp.colors.text,
                selectedTextColor = Gp.colors.text,
                indicatorColor = Gp.colors.tabSelected,
                unselectedIconColor = Gp.colors.textSecondary,
                unselectedTextColor = Gp.colors.textSecondary,
            ),
    )
