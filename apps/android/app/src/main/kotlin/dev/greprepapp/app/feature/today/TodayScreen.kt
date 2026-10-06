package dev.greprepapp.app.feature.today

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import dev.greprepapp.app.R
import dev.greprepapp.app.feature.today.TodayViewModel.Content
import dev.greprepapp.app.feature.today.TodayViewModel.Problem
import dev.greprepapp.app.feature.training.ContinueTraining
import dev.greprepapp.app.feature.training.label
import dev.greprepapp.app.feature.training.study
import dev.greprepapp.app.ui.EmptyState
import dev.greprepapp.app.ui.LoadingState
import dev.greprepapp.app.ui.StatusLine
import dev.greprepapp.app.ui.TabScreen
import dev.greprepapp.app.ui.label
import dev.greprepapp.design.Gp
import dev.greprepapp.design.GpSecondaryButton
import greprep.design.GpLayout
import greprep.design.GpRadius
import greprep.design.GpSize
import greprep.design.GpSpace

/** Вкладка «Сегодня»: лента шагов на день (макет T1-Today, design/directions). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayContent(
    state: TodayViewModel.UiState,
    onRefresh: () -> Unit,
    onSelect: (TodayPlan.Step) -> Unit,
    modifier: Modifier = Modifier,
    continueTraining: ContinueTraining? = null,
    onContinueTraining: (String) -> Unit = {},
    onNewTraining: () -> Unit = {},
) {
    val content = state.content
    TabScreen(
        title = stringResource(R.string.tab_today),
        glow = (content as? Content.Plan)?.plan?.current?.section,
        modifier = modifier,
    ) { padding ->
        when (content) {
            Content.Loading -> {
                LoadingState(
                    text = stringResource(R.string.today_loading),
                    modifier = Modifier.padding(padding).testTag("today.loading"),
                )
            }

            is Content.Unavailable -> {
                EmptyState(
                    title =
                        stringResource(
                            if (content.problem == Problem.Offline) R.string.today_offline_title else R.string.today_failed_title,
                        ),
                    message =
                        stringResource(
                            if (content.problem == Problem.Offline) R.string.today_offline_message else R.string.today_failed_message,
                        ),
                    icon = if (content.problem == Problem.Offline) R.drawable.ic_wifi_off else R.drawable.ic_error,
                    action = stringResource(R.string.today_retry),
                    actionBusy = state.isRefreshing,
                    onAction = onRefresh,
                    modifier = Modifier.padding(padding).testTag("today.unavailable"),
                )
            }

            is Content.Plan -> {
                PullToRefreshBox(
                    isRefreshing = state.isRefreshing,
                    onRefresh = onRefresh,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    PlanList(
                        plan = content.plan,
                        stale = state.stale,
                        blockedStepId = state.blockedStepId,
                        padding = padding,
                        onSelect = onSelect,
                        trainings = TrainingEntries(continueTraining, onContinueTraining, onNewTraining),
                    )
                }
            }
        }
    }
}

/** Входы в тренировки с «Сегодня»: продолжить начатую и собрать свою (макет T1). */
private class TrainingEntries(
    val active: ContinueTraining?,
    val onContinue: (String) -> Unit,
    val onNew: () -> Unit,
)

@Composable
private fun PlanList(
    plan: TodayPlan,
    stale: Problem?,
    blockedStepId: String?,
    padding: PaddingValues,
    onSelect: (TodayPlan.Step) -> Unit,
    trainings: TrainingEntries,
) {
    val summary = TodaySummary.text(LocalResources.current, plan)
    val ribbonLabel = stringResource(R.string.today_plan)
    // Колонка не шире 720 и прижата к краю заголовка: на планшете лишняя ширина остаётся справа пустой
    // (DESIGN.md, «Раскладка»), а лента не уезжает от заголовка экрана.
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.TopStart) {
        LazyColumn(
            modifier =
                Modifier
                    .widthIn(max = GpLayout.contentMax + GpLayout.gutter * 2)
                    .fillMaxWidth()
                    .semantics { contentDescription = ribbonLabel }
                    .testTag("today.plan"),
            contentPadding =
                PaddingValues(
                    start = GpLayout.gutter,
                    end = GpLayout.gutter,
                    top = padding.calculateTopPadding(),
                    bottom = padding.calculateBottomPadding() + GpSpace.s32,
                ),
        ) {
            item(key = "summary") {
                Text(
                    text = summary,
                    style = Gp.type.subhead.withNumbers(),
                    color = Gp.colors.textSecondary,
                    modifier = Modifier.testTag("today.summary"),
                )
            }
            if (stale != null) {
                item(key = "stale") {
                    StatusLine(
                        icon = if (stale == Problem.Offline) R.drawable.ic_wifi_off else R.drawable.ic_sync_problem,
                        text =
                            stringResource(
                                if (stale == Problem.Offline) R.string.today_stale_offline else R.string.today_stale_failed,
                            ),
                        modifier = Modifier.padding(top = GpSpace.s12).testTag("today.stale"),
                    )
                }
            }
            trainings.active?.let { active ->
                item(key = "continue") {
                    ContinueRow(
                        active,
                        onClick = { trainings.onContinue(active.trainingId) },
                        modifier = Modifier.padding(top = GpSpace.s20),
                    )
                }
            }
            item(key = "gap") { Box(Modifier.padding(top = GpSpace.s28)) }
            items(plan.steps, key = { it.id }) { step ->
                StepRow(step = step, isBlocked = step.id == blockedStepId, onSelect = onSelect)
            }
            item(key = "end") { RibbonEnd(isComplete = plan.isComplete) }
            item(key = "own") {
                GpSecondaryButton(
                    text = stringResource(R.string.training_own),
                    onClick = trainings.onNew,
                    modifier = Modifier.padding(top = GpSpace.s32).fillMaxWidth().testTag("today.newTraining"),
                )
            }
        }
    }
}

/** Числа ровными столбцами (tabular-nums): минуты не прыгают при обновлении. */
private fun TextStyle.withNumbers(): TextStyle = copy(fontFeatureSettings = "tnum")

/** Начатая тренировка: строка, которая открывает её на том же вопросе; стрелка — она ведёт дальше. */
@Composable
private fun ContinueRow(
    active: ContinueTraining,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = Gp.colors
    val section = active.section.study()
    val what = (listOf(section.label()) + active.types.map { it.label() }).joinToString(" · ")
    Surface(
        onClick = onClick,
        color = colors.surface,
        shape = RoundedCornerShape(GpRadius.xxl),
        border = BorderStroke(GpSize.hairline, colors.line),
        modifier = modifier.fillMaxWidth().testTag("today.continue"),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = GpSpace.s16, vertical = GpSpace.s14),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(GpSpace.s12),
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(GpSpace.s2)) {
                Text(
                    text = stringResource(R.string.training_continue),
                    style = Gp.type.body.copy(fontWeight = FontWeight.W500),
                    color = colors.text,
                )
                Text(
                    text = stringResource(R.string.training_continue_subtitle, what, active.position + 1, active.total),
                    style = Gp.type.subhead,
                    color = section.color(colors),
                )
            }
            Icon(
                painter = painterResource(R.drawable.ic_chevron_right),
                contentDescription = null,
                tint = colors.textSecondary,
                modifier = Modifier.size(GpSpace.s20),
            )
        }
    }
}
