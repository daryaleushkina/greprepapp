package dev.greprepapp.app.feature.shell

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import dev.greprepapp.app.R
import dev.greprepapp.app.feature.today.TodayPlan
import dev.greprepapp.app.ui.EmptyState
import dev.greprepapp.app.ui.NestedScreen
import dev.greprepapp.app.ui.TabScreen
import dev.greprepapp.app.ui.label
import dev.greprepapp.design.Gp
import greprep.design.GpLayout
import greprep.design.GpRadius
import greprep.design.GpSpace

/** Раздел, которого в каркасе ещё нет: честно говорит, что здесь будет. */
@Composable
fun SectionPlaceholderScreen(
    title: String,
    message: String,
    tag: String,
    modifier: Modifier = Modifier,
) {
    TabScreen(title = title, modifier = modifier) { padding ->
        EmptyState(
            title = stringResource(R.string.placeholder_soon),
            message = message,
            modifier = Modifier.padding(padding).testTag(tag),
        )
    }
}

/** Шаг ленты, открытый из «Сегодня». Сами тренировки и слова — следующие части (ROADMAP §5). */
@Composable
fun StepPlaceholderScreen(
    step: TodayPlan.Step,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    NestedScreen(title = step.section.label(), onBack = onBack, glow = step.section, modifier = modifier) { padding ->
        EmptyState(
            title = step.title,
            message = stringResource(R.string.step_placeholder),
            modifier = Modifier.padding(padding).testTag("step.placeholder"),
        )
    }
}

/**
 * «Прогресс» и вход в настройки (PRODUCT.md, «Навигация»: настройки — в «Прогрессе»). Пока тренировок нет,
 * экран пустой, как в макете G6-ProgressEmpty.
 */
@Composable
fun ProgressScreen(
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TabScreen(
        title = stringResource(R.string.tab_progress),
        modifier = modifier,
        actions = {
            IconButton(onClick = onOpenSettings, modifier = Modifier.testTag("progress.settings")) {
                Icon(
                    painter = painterResource(R.drawable.ic_settings),
                    contentDescription = stringResource(R.string.settings),
                )
            }
        },
    ) { padding ->
        EmptyState(
            title = stringResource(R.string.progress_empty_title),
            message = stringResource(R.string.progress_empty_message),
            modifier = Modifier.padding(padding).testTag("progress.empty"),
        )
    }
}

/** Настройки (макет G2-Settings). В каркасе — выход и версия; язык, тема и размер текста — своей частью. */
@Composable
fun SettingsScreen(
    appVersion: String,
    onSignOut: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    NestedScreen(title = stringResource(R.string.settings), onBack = onBack, modifier = modifier) { padding ->
        // Колонка не шире 720 и прижата к краю заголовка, как лента «Сегодня»: на планшете лишняя ширина
        // остаётся справа пустой. Ширина ограничивается до fillMaxWidth — после fillMaxSize она бы не сработала.
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(padding)
                    .padding(horizontal = GpLayout.gutter, vertical = GpSpace.s16),
        ) {
            Column(
                modifier = Modifier.widthIn(max = GpLayout.contentMax).fillMaxWidth().testTag("settings.column"),
                verticalArrangement = Arrangement.spacedBy(GpSpace.s8),
            ) {
                Surface(
                    color = Gp.colors.surface,
                    shape = RoundedCornerShape(GpRadius.xxl),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    ListItem(
                        headlineContent = { Text(stringResource(R.string.settings_sign_out)) },
                        colors = ListItemDefaults.colors(containerColor = Gp.colors.surface),
                        modifier =
                            Modifier
                                .clickable(role = Role.Button, onClick = onSignOut)
                                .testTag("settings.signOut"),
                    )
                }
                Text(
                    text = stringResource(R.string.settings_version, appVersion),
                    style = Gp.type.footnote,
                    color = Gp.colors.textSecondary,
                    modifier = Modifier.padding(horizontal = GpSpace.s16),
                )
                Text(
                    text = stringResource(R.string.ets_disclaimer),
                    style = Gp.type.caption,
                    color = Gp.colors.textSecondary,
                    modifier = Modifier.padding(horizontal = GpSpace.s16, vertical = GpSpace.s8).testTag("settings.disclaimer"),
                )
            }
        }
    }
}
