package dev.greprepapp.app.feature.today

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.greprepapp.app.R
import dev.greprepapp.app.ui.StatusLine
import dev.greprepapp.app.ui.label
import dev.greprepapp.design.Gp
import dev.greprepapp.design.GpPrimaryButton
import dev.greprepapp.design.pressScale
import greprep.design.GpRadius
import greprep.design.GpSize
import greprep.design.GpSpace

/** Колонка узлов — шириной с текущий узел; нить идёт по её центру. */
private val NodeColumn = GpSize.stepNodeCurrent
private val RowGap = GpSpace.s24

/** Внутренний отступ карточки шага (компонент card). */
private val CardPadding = GpSpace.s16

/**
 * Лента шагов дня (DESIGN.md, «Лента шагов»): узлы на нити, в фокусе один шаг — карточка с главной кнопкой,
 * остальное — тихие строки; конец ленты виден. Строки — отдельными элементами списка, чтобы длинный план
 * прокручивался лениво.
 */
@Composable
fun StepRow(
    step: TodayPlan.Step,
    isBlocked: Boolean,
    onSelect: (TodayPlan.Step) -> Unit,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    val type = Gp.type
    val title3 = Gp.title3
    // Узел — по центру первой строки шага: у текущего — строки заголовка карточки.
    val nodeTop =
        with(density) {
            if (step.state == TodayPlan.State.Current) {
                CardPadding + title3.lineHeight.toDp() / 2 - GpSize.stepNodeCurrent / 2
            } else {
                (type.body.lineHeight.toDp() / 2 - GpSize.stepNode / 2).coerceAtLeast(0.dp)
            }
        }
    val nodeSize = if (step.state == TodayPlan.State.Current) GpSize.stepNodeCurrent else GpSize.stepNode
    Row(
        modifier = modifier.fillMaxWidth().height(IntrinsicSize.Min),
        horizontalArrangement = Arrangement.spacedBy(GpSpace.s14),
    ) {
        Box(
            modifier = Modifier.width(NodeColumn).fillMaxHeight(),
            contentAlignment = Alignment.TopCenter,
        ) {
            Thread(top = nodeTop + nodeSize + GpSpace.s4)
            Node(step = step, modifier = Modifier.padding(top = nodeTop))
        }
        Box(modifier = Modifier.weight(1f).padding(bottom = RowGap)) {
            when (step.state) {
                TodayPlan.State.Current -> CurrentStepCard(step, isBlocked, onStart = { onSelect(step) })
                TodayPlan.State.Next -> QuietStep(step, isBlocked, onClick = { onSelect(step) })
                TodayPlan.State.Done -> QuietStep(step, isBlocked = false, onClick = null)
            }
        }
    }
}

/** Нить от узла вниз, до следующего шага. */
@Composable
private fun Thread(top: Dp) {
    Box(
        modifier =
            Modifier
                .padding(top = top)
                .width(GpSize.stepLine)
                .fillMaxHeight()
                .background(Gp.colors.line),
    )
}

@Composable
private fun Node(
    step: TodayPlan.Step,
    modifier: Modifier = Modifier,
) {
    val colors = Gp.colors
    val sectionColor = step.section.color(colors)
    when (step.state) {
        TodayPlan.State.Current -> {
            val tint = step.section.tint(colors)
            Box(
                modifier =
                    modifier
                        .size(GpSize.stepNodeCurrent)
                        .drawBehind {
                            // Кольцо цвета раздела вокруг узла (step-node-current).
                            drawCircle(tint, radius = size.minDimension / 2 + GpSize.stepRing.toPx())
                        }.background(sectionColor, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(step.section.icon),
                    contentDescription = null,
                    tint = colors.surface,
                    modifier = Modifier.size(GpSize.stepNodeCurrent / 2),
                )
            }
        }

        TodayPlan.State.Next -> {
            Box(
                modifier =
                    modifier
                        .size(GpSize.stepNode)
                        .background(colors.surface, CircleShape)
                        .border(GpSize.hairline, colors.line, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(step.section.icon),
                    contentDescription = null,
                    tint = sectionColor,
                    modifier = Modifier.size(GpSize.stepNode / 2),
                )
            }
        }

        TodayPlan.State.Done -> {
            Box(
                modifier = modifier.size(GpSize.stepNode).background(sectionColor, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(R.drawable.ic_check),
                    contentDescription = null,
                    tint = colors.surface,
                    modifier = Modifier.size(GpSize.stepNode / 2),
                )
            }
        }
    }
}

/** Шаг в фокусе: карточка на плотной поверхности и одна главная кнопка (DESIGN.md, «Правило освещённого шага»). */
@Composable
private fun CurrentStepCard(
    step: TodayPlan.Step,
    isBlocked: Boolean,
    onStart: () -> Unit,
) {
    val colors = Gp.colors
    val now = stringResource(R.string.today_now, step.title)
    Surface(
        color = colors.surface,
        shape = RoundedCornerShape(GpRadius.xxl),
        border = BorderStroke(GpSize.hairline, colors.line),
        modifier = Modifier.fillMaxWidth().testTag("today.current"),
    ) {
        Column(
            modifier = Modifier.padding(CardPadding),
            verticalArrangement = Arrangement.spacedBy(GpSpace.s4),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(GpSpace.s12),
                verticalAlignment = Alignment.Top,
            ) {
                Text(
                    text = step.title,
                    style = Gp.title3,
                    color = colors.text,
                    modifier =
                        Modifier.weight(1f).semantics {
                            heading()
                            contentDescription = now
                        },
                )
                Minutes(step)
            }
            Text(
                text = step.section.label(),
                style = Gp.type.subhead.copy(fontWeight = FontWeight.W500),
                color = step.section.color(colors),
            )
            GpPrimaryButton(
                text = stringResource(R.string.today_start),
                onClick = onStart,
                modifier = Modifier.fillMaxWidth().padding(top = GpSpace.s12).testTag("today.start"),
            )
            if (isBlocked) NeedsNetworkNote(Modifier.padding(top = GpSpace.s8))
        }
    }
}

/** Шаг не в фокусе: тихая строка на фоне. onClick = null — шаг пройден, нажимать нечего. */
@Composable
private fun QuietStep(
    step: TodayPlan.Step,
    isBlocked: Boolean,
    onClick: (() -> Unit)?,
) {
    val colors = Gp.colors
    val interaction = remember { MutableInteractionSource() }
    val clickable =
        if (onClick != null) {
            Modifier
                .pressScale(interaction)
                .clickable(
                    interactionSource = interaction,
                    indication = ripple(),
                    role = Role.Button,
                    onClickLabel = stringResource(R.string.today_start_step),
                    onClick = onClick,
                )
        } else {
            Modifier
        }
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .minimumInteractiveComponentSize()
                .then(clickable)
                .testTag("today.step.${step.id}"),
        verticalArrangement = Arrangement.spacedBy(GpSpace.s8),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(GpSpace.s12)) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(GpSpace.s2)) {
                Text(
                    text = step.title,
                    style = Gp.type.body.copy(fontWeight = FontWeight.W500),
                    color = colors.text,
                )
                Text(text = step.section.label(), style = Gp.type.subhead, color = step.section.color(colors))
            }
            Minutes(step)
        }
        if (isBlocked) NeedsNetworkNote()
    }
}

@Composable
private fun Minutes(step: TodayPlan.Step) {
    val text =
        if (step.state == TodayPlan.State.Done) {
            stringResource(R.string.today_step_minutes, step.minutes)
        } else {
            stringResource(R.string.today_step_minutes_approx, step.minutes)
        }
    Text(text = text, style = Gp.type.subhead.copy(fontFeatureSettings = "tnum"), color = Gp.colors.textSecondary)
}

/** Объяснение у шага, который не начать без сети: начатое доживёт без сети, новое — нет (PRODUCT.md). */
@Composable
private fun NeedsNetworkNote(modifier: Modifier = Modifier) {
    StatusLine(
        icon = R.drawable.ic_wifi_off,
        text = stringResource(R.string.today_needs_network),
        modifier = modifier.testTag("today.needsNetwork"),
    )
}

/** Видимый конец ленты (COGA: видно, сколько осталось). */
@Composable
fun RibbonEnd(
    isComplete: Boolean,
    modifier: Modifier = Modifier,
) {
    val colors = Gp.colors
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(GpSpace.s14),
        verticalAlignment = if (isComplete) Alignment.Top else Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.width(NodeColumn).padding(top = if (isComplete) GpSpace.s8 else 0.dp),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(GpSize.stepEnd).background(colors.line, CircleShape))
        }
        if (isComplete) {
            Column(verticalArrangement = Arrangement.spacedBy(GpSpace.s2)) {
                Text(
                    text = stringResource(R.string.today_done_title),
                    style = Gp.type.body.copy(fontWeight = FontWeight.W500),
                    color = colors.text,
                )
                Text(
                    text = stringResource(R.string.today_done_subtitle),
                    style = Gp.type.subhead,
                    color = colors.textSecondary,
                )
            }
        } else {
            Text(text = stringResource(R.string.today_end), style = Gp.type.subhead, color = colors.textSecondary)
        }
    }
}
