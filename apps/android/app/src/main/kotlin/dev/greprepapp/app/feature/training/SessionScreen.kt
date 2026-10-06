package dev.greprepapp.app.feature.training

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.greprepapp.api.models.Question
import dev.greprepapp.api.models.QuestionType
import dev.greprepapp.app.R
import dev.greprepapp.app.feature.training.SessionViewModel.Screen
import dev.greprepapp.app.feature.training.SessionViewModel.UiState
import dev.greprepapp.app.ui.EmptyState
import dev.greprepapp.app.ui.StatusLine
import dev.greprepapp.app.ui.label
import dev.greprepapp.design.Gp
import dev.greprepapp.design.GpPrimaryButton
import dev.greprepapp.design.GpSecondaryButton
import dev.greprepapp.design.SectionBackground
import dev.greprepapp.design.StudySection
import greprep.design.GpLayout
import greprep.design.GpRadius
import greprep.design.GpSize
import greprep.design.GpSpace
import kotlin.math.roundToInt

/** Точек прогресса не больше, чем помещается в шапку; дальше — только «12 из 40». */
private const val MAX_DOTS = 20
private const val SECONDS_PER_MINUTE = 60
private const val TIMER_FORMAT = "%d:%02d"
private const val NBSP = '\u00A0'

/** Действия экрана сессии — одним набором, чтобы снимки экранов подставляли пустые. */
@Immutable
class SessionActions(
    val onClose: () -> Unit = {},
    val onSelect: (String) -> Unit = {},
    val onCheck: () -> Unit = {},
    val onDontKnow: () -> Unit = {},
    val onNext: () -> Unit = {},
    val onFlag: () -> Unit = {},
    val onOverview: () -> Unit = {},
    val onCloseOverview: () -> Unit = {},
    val onGoTo: (Int) -> Unit = {},
    val onFinish: () -> Unit = {},
    val onLanguage: (Boolean) -> Unit = {},
    val onToggleWhyNot: () -> Unit = {},
    val onReport: (Int) -> Unit = {},
    val onReview: () -> Unit = {},
    val onRepeat: () -> Unit = {},
)

/** Сессия тренировки: вопрос за вопросом, а в конце — итог (макеты R3–R6, R9, R14, R15). */
@Composable
fun SessionScreen(
    trainingId: String,
    onClose: () -> Unit,
    onReview: () -> Unit,
    onReport: (ReportTarget) -> Unit,
    onRepeatStarted: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SessionViewModel =
        hiltViewModel<SessionViewModel, SessionViewModel.Factory>(key = trainingId) { it.create(trainingId) },
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val repeat by viewModel.repeat.collectAsStateWithLifecycle()
    LaunchedEffect(repeat.started) {
        repeat.started?.let {
            viewModel.consumeRepeat()
            onRepeatStarted(it)
        }
    }
    val overview = (state as? UiState.Active)?.screen?.overview == true
    // «Назад» со списка вопросов — к вопросу, а не прочь из тренировки.
    BackHandler(enabled = overview, onBack = viewModel::closeOverview)
    SessionContent(
        state = state,
        repeat = repeat,
        actions =
            SessionActions(
                onClose = onClose,
                onSelect = viewModel::select,
                onCheck = viewModel::check,
                onDontKnow = viewModel::dontKnow,
                onNext = viewModel::next,
                onFlag = viewModel::toggleFlag,
                onOverview = viewModel::openOverview,
                onCloseOverview = viewModel::closeOverview,
                onGoTo = viewModel::goTo,
                onFinish = viewModel::finish,
                onLanguage = viewModel::setEnglish,
                onToggleWhyNot = viewModel::toggleWhyNot,
                onReport = { position ->
                    (state as? UiState.Active)?.screen?.training?.let { onReport(it.reportTarget(position)) }
                },
                onReview = onReview,
                onRepeat = viewModel::repeatMistakes,
            ),
        modifier = modifier,
    )
}

@Composable
fun SessionContent(
    state: UiState,
    repeat: SessionViewModel.RepeatState,
    actions: SessionActions,
    modifier: Modifier = Modifier,
) {
    when (state) {
        UiState.Loading -> {
            // Чтение файла с устройства — миллисекунды: крутилка только мигнула бы.
            SectionBackground(section = null, modifier = modifier.testTag("session.loading")) {}
        }

        UiState.Missing -> {
            SectionBackground(section = null, modifier = modifier) {
                EmptyState(
                    title = stringResource(R.string.training_missing_title),
                    message = stringResource(R.string.training_missing_message),
                    action = stringResource(R.string.summary_done),
                    onAction = actions.onClose,
                    modifier = Modifier.testTag("session.missing"),
                )
            }
        }

        is UiState.Active -> {
            val s = state.screen
            val section =
                s.training.session.section
                    .study()
            val result = s.result
            SectionBackground(section = section, modifier = modifier) {
                when {
                    result != null -> SummaryPane(s, result, section, repeat, actions)
                    s.overview -> OverviewPane(s, section, actions)
                    else -> QuestionPane(s, section, actions)
                }
            }
        }
    }
}

/** Язык разбора: выбранный на разборе или язык интерфейса. */
@Composable
private fun Screen.explanationInEnglish(): Boolean = english ?: (LocalConfiguration.current.locales[0].language == "en")

@Composable
private fun QuestionPane(
    s: Screen,
    section: StudySection,
    actions: SessionActions,
) {
    Scaffold(
        containerColor = Color.Transparent,
        topBar = { SessionHeader(s, section, actions) },
        bottomBar = { QuestionActions(s, actions) },
    ) { padding ->
        SessionColumn(padding = padding, tag = "question") {
            QuestionHeading(s.question, section, onReport = { actions.onReport(s.position) })
            QuestionBody(s, section, actions)
            if (s.revealed) {
                ExplanationPanel(
                    question = s.question,
                    answer = s.training.answer(s.position),
                    english = s.explanationInEnglish(),
                    whyNotOpen = s.whyNotOpen,
                    section = section,
                    onLanguage = actions.onLanguage,
                    onToggleWhyNot = actions.onToggleWhyNot,
                    modifier = Modifier.padding(top = GpSpace.s8),
                )
            }
        }
    }
}

/** Колонка сессии: на планшете — не шире 720 и по центру (режим фокуса, DESIGN.md «Навигация»). */
@Composable
private fun SessionColumn(
    padding: PaddingValues,
    tag: String,
    content: @Composable () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        Column(
            modifier =
                Modifier
                    .widthIn(max = GpLayout.contentMax + GpLayout.gutter * 2)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(padding)
                    .padding(horizontal = GpLayout.gutter, vertical = GpSpace.s8)
                    .testTag(tag),
            verticalArrangement = Arrangement.spacedBy(GpSpace.s20),
        ) {
            content()
        }
    }
}

@Composable
private fun QuestionHeading(
    question: Question,
    section: StudySection,
    onReport: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = question.typeLabel(),
            style = Gp.type.footnote,
            color = section.color(Gp.colors),
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = onReport, modifier = Modifier.testTag("question.report")) {
            Text(text = stringResource(R.string.question_report), style = Gp.type.caption, color = Gp.colors.textSecondary)
        }
    }
}

@Composable
private fun QuestionBody(
    s: Screen,
    section: StudySection,
    actions: SessionActions,
) {
    val q = s.question
    when (q.questionType) {
        QuestionType.QUANTITATIVE_COMPARISON -> Quantities(q)
        QuestionType.MULTIPLE_CHOICE -> PlainPrompt(q)
        else -> PromptText(question = q, selection = if (s.revealed) q.answer else s.selection, section = section)
    }
    if (s.revealed) {
        RevealedOptions(
            q,
            s.training
                .answer(s.position)
                ?.optionIds
                .orEmpty(),
            section,
        )
    } else {
        ChoosableOptions(q, s.selection, section, actions.onSelect)
    }
}

@Composable
private fun PlainPrompt(question: Question) {
    Text(
        text = question.prompt,
        style = Gp.type.prompt.copy(localeList = English),
        color = Gp.colors.text,
        modifier = Modifier.testTag("question.prompt"),
    )
}

/** Quantitative Comparison (макет R9): условие по центру, две величины рядом. */
@Composable
fun Quantities(
    question: Question,
    modifier: Modifier = Modifier,
) {
    val colors = Gp.colors
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(GpSpace.s16)) {
        question.condition?.let {
            Text(
                text = it,
                style = Gp.type.prompt.copy(localeList = English),
                color = colors.text,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().testTag("question.condition"),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(GpSpace.s12)) {
            Quantity(stringResource(R.string.quantity_a), question.quantityA.orEmpty(), Modifier.weight(1f))
            Quantity(stringResource(R.string.quantity_b), question.quantityB.orEmpty(), Modifier.weight(1f))
        }
    }
}

@Composable
private fun Quantity(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Surface(color = Gp.colors.surface, shape = RoundedCornerShape(GpRadius.xl), modifier = modifier) {
        Column(
            modifier = Modifier.padding(GpSpace.s16),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(GpSpace.s8),
        ) {
            Text(text = label, style = Gp.type.footnote, color = Gp.colors.textSecondary)
            Text(
                text = value,
                style = Gp.type.headline.copy(localeList = English),
                color = Gp.colors.text,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** Варианты до ответа: одна группа — строки с буквами; несколько пропусков — группы (i), (ii), (iii). */
@Composable
private fun ChoosableOptions(
    question: Question,
    selection: List<String>,
    section: StudySection,
    onSelect: (String) -> Unit,
) {
    val many = question.groups.size > 1
    Column(verticalArrangement = Arrangement.spacedBy(if (many) GpSpace.s16 else GpSpace.s8)) {
        question.groups.forEachIndexed { g, group ->
            if (many) {
                Text(
                    text = BLANK_NUMBERS.getOrElse(g) { "" },
                    style = Gp.type.footnote.copy(fontWeight = FontWeight.W600),
                    color = Gp.colors.textSecondary,
                )
            }
            if (many) {
                // У пропуска три коротких варианта — рядом, а не столбиком на полэкрана (макет R5).
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(GpSpace.s8),
                    verticalArrangement = Arrangement.spacedBy(GpSpace.s8),
                ) {
                    group.options.forEach { option ->
                        OptionChip(option, selected = option.id in selection, section = section, onClick = { onSelect(option.id) })
                    }
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(GpSpace.s8)) {
                    group.options.forEach { option ->
                        OptionRow(
                            option = option,
                            mark = if (option.id in selection) OptionMark.Selected else OptionMark.None,
                            section = section,
                            multiple = question.selectCount > 1,
                            onClick = { onSelect(option.id) },
                        )
                    }
                }
            }
        }
    }
}

/**
 * Варианты после ответа (макет R4): рядом только верный и ваш, остальные — одной тихой строкой. Условие, ваш и
 * верный ответ видны вместе — держать в памяти нечего (PRODUCT.md, «Accessibility»).
 */
@Composable
fun RevealedOptions(
    question: Question,
    chosen: List<String>,
    section: StudySection,
    modifier: Modifier = Modifier,
) {
    val many = question.groups.size > 1
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(GpSpace.s8)) {
        question.groups.forEachIndexed { g, group ->
            val shown = group.options.filter { it.id in question.answer || it.id in chosen }
            val rest = group.options - shown.toSet()
            shown.forEach { option ->
                OptionRow(
                    option = option,
                    mark = if (option.id in question.answer) OptionMark.Correct else OptionMark.Wrong,
                    section = section,
                    letter = if (many) BLANK_NUMBERS.getOrElse(g) { "" } else option.id,
                )
            }
            if (rest.isNotEmpty()) {
                val others = stringResource(R.string.question_others)
                Text(
                    text = rest.joinToString("   ") { if (many) it.text else "${it.id} ${it.text}" },
                    style = Gp.type.subhead.copy(localeList = English),
                    color = Gp.colors.textSecondary,
                    modifier =
                        Modifier
                            .padding(horizontal = GpSpace.s12)
                            .semantics { contentDescription = "$others: ${rest.joinToString { it.text }}" },
                )
            }
        }
    }
}

/** Шапка сессии: закрыть, конец сессии точками или таймер «Проверки», справа — отметка и список вопросов. */
@Composable
private fun SessionHeader(
    s: Screen,
    section: StudySection,
    actions: SessionActions,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .height(GpSize.rowTall)
                .padding(horizontal = GpSpace.s4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = actions.onClose, modifier = Modifier.testTag("session.close")) {
            Icon(
                painter = painterResource(R.drawable.ic_close),
                contentDescription = stringResource(R.string.question_close),
                tint = Gp.colors.text,
            )
        }
        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
            val remaining = s.remainingSeconds
            if (remaining != null) {
                TimerPill(remaining, s.position, s.training.total)
            } else {
                ProgressDots(s, section)
            }
        }
        if (s.training.isCheck && !s.overview) {
            IconButton(onClick = actions.onFlag, modifier = Modifier.testTag("question.flag")) {
                Icon(
                    painter = painterResource(if (s.flagged) R.drawable.ic_flag_filled else R.drawable.ic_flag),
                    contentDescription = stringResource(if (s.flagged) R.string.question_unflag else R.string.question_flag),
                    tint = if (s.flagged) section.color(Gp.colors) else Gp.colors.text,
                )
            }
            IconButton(onClick = actions.onOverview, modifier = Modifier.testTag("question.overview")) {
                Icon(
                    painter = painterResource(R.drawable.ic_grid_view),
                    contentDescription = stringResource(R.string.question_overview),
                    tint = Gp.colors.text,
                )
            }
        } else {
            Spacer(Modifier.size(GpSize.tapTarget + GpSpace.s4))
        }
    }
}

/** Конец сессии виден заранее (DESIGN.md, «Правило одной задачи»): точка на вопрос и «4 из 10». */
@Composable
private fun ProgressDots(
    s: Screen,
    section: StudySection,
) {
    val colors = Gp.colors
    val total = s.training.total
    val description = stringResource(R.string.question_progress_description, s.position + 1, total)
    Row(
        modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = description }.testTag("session.progress"),
        horizontalArrangement = Arrangement.spacedBy(GpSpace.s8),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (total <= MAX_DOTS) {
            Row(horizontalArrangement = Arrangement.spacedBy(GpSpace.s4)) {
                repeat(total) { i ->
                    val answer = s.training.answer(i)
                    val color =
                        when {
                            answer != null && TrainingRules.isCorrect(s.training.question(i), answer.optionIds) -> section.color(colors)
                            answer != null -> colors.wrong
                            i == s.position -> colors.text
                            else -> colors.line
                        }
                    Box(Modifier.size(if (i == s.position) GpSpace.s8 else GpSpace.s6).background(color, CircleShape))
                }
            }
        }
        Text(
            text = stringResource(R.string.question_of, s.position + 1, total),
            style = Gp.type.footnote.copy(fontFeatureSettings = "tnum"),
            color = colors.textSecondary,
        )
    }
}

/** Таймер «Проверки» (макет R14): виден всегда, без красного — спокойно, но честно. */
@Composable
private fun TimerPill(
    remaining: Int,
    position: Int,
    total: Int,
) {
    val minutes = remaining / SECONDS_PER_MINUTE
    val seconds = remaining % SECONDS_PER_MINUTE
    val description = stringResource(R.string.timer_description, minutes, seconds, position + 1, total)
    Surface(
        color = Gp.colors.fill,
        shape = CircleShape,
        modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = description }.testTag("session.timer"),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = GpSpace.s14, vertical = GpSpace.s6),
            horizontalArrangement = Arrangement.spacedBy(GpSpace.s8),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                painter = painterResource(R.drawable.ic_timer),
                contentDescription = null,
                tint = Gp.colors.textSecondary,
                modifier = Modifier.size(GpSpace.s20),
            )
            Text(
                text = TIMER_FORMAT.format(minutes, seconds),
                style = Gp.type.timer.copy(fontFeatureSettings = "tnum"),
                color = Gp.colors.text,
            )
            Text(
                text = stringResource(R.string.question_of, position + 1, total),
                style = Gp.type.footnote.copy(fontFeatureSettings = "tnum"),
                color = Gp.colors.textSecondary,
            )
        }
    }
}

/** Нижняя панель: содержимое уходит под растушёвку; одна главная кнопка в одном месте. */
@Composable
fun BottomActions(
    modifier: Modifier = Modifier,
    note: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val bg = Gp.colors.bg
    Column(modifier = modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(GpSize.fade).background(Brush.verticalGradient(listOf(Color.Transparent, bg))))
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .background(bg)
                    .navigationBarsPadding()
                    .padding(start = GpLayout.gutter, end = GpLayout.gutter, bottom = GpSpace.s12),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(GpSpace.s12),
        ) {
            note?.invoke()
            Box(modifier = Modifier.widthIn(max = GpLayout.contentMax).fillMaxWidth()) { content() }
        }
    }
}

@Composable
private fun QuestionActions(
    s: Screen,
    actions: SessionActions,
) {
    val total = s.training.total
    val nextLabel =
        if (s.isLast) {
            stringResource(if (s.training.isCheck) R.string.question_to_list else R.string.question_result)
        } else {
            stringResource(R.string.question_next, s.position + 2, total)
        }
    when {
        s.training.isCheck -> {
            BottomActions(note = { Note(stringResource(R.string.question_check_note)) }) {
                ActionRow(
                    secondary = stringResource(R.string.question_skip) to actions.onNext,
                    primary = nextLabel,
                    onPrimary = actions.onNext,
                    primaryTag = "question.next",
                )
            }
        }

        s.revealed -> {
            BottomActions {
                GpPrimaryButton(
                    text = nextLabel,
                    onClick = actions.onNext,
                    modifier = Modifier.fillMaxWidth().testTag("question.next"),
                )
            }
        }

        else -> {
            BottomActions(note = missingNote(s)?.let { text -> { Note(text) } }) {
                ActionRow(
                    secondary = stringResource(R.string.question_dont_know) to actions.onDontKnow,
                    primary = stringResource(R.string.question_check),
                    onPrimary = actions.onCheck,
                    primaryEnabled = s.canCheck,
                    primaryTag = "question.check",
                    secondaryTag = "question.dontKnow",
                )
            }
        }
    }
}

/** Что ещё выбрать, чтобы «Проверить» включилась (макет R5); пока не выбрано ничего — молчим. */
@Composable
private fun missingNote(s: Screen): String? {
    val q = s.question
    if (s.selection.isEmpty()) return null
    val missing = s.missing
    if (missing.isEmpty()) return null
    return when {
        q.groups.size > 1 && missing.size == 1 -> stringResource(R.string.question_missing_blank, BLANK_NUMBERS[missing[0]])
        q.groups.size > 1 -> stringResource(R.string.question_missing_blanks, missing.joinToString(", ") { BLANK_NUMBERS[it] })
        q.selectCount > 1 -> stringResource(R.string.question_pick_one_more)
        else -> null
    }
}

@Composable
private fun Note(text: String) {
    Text(
        text = text,
        style = Gp.type.footnote,
        color = Gp.colors.textSecondary,
        textAlign = TextAlign.Center,
        modifier = Modifier.testTag("session.note"),
    )
}

@Composable
private fun ActionRow(
    secondary: Pair<String, () -> Unit>,
    primary: String,
    onPrimary: () -> Unit,
    primaryTag: String,
    primaryEnabled: Boolean = true,
    primaryBusy: Boolean = false,
    secondaryTag: String = "session.secondary",
) {
    Row(horizontalArrangement = Arrangement.spacedBy(GpSpace.s12)) {
        // Вторичная — по своей ширине, главная — всё остальное: длинная подпись главной не переносится.
        GpSecondaryButton(
            text = secondary.first,
            onClick = secondary.second,
            modifier = Modifier.testTag(secondaryTag),
        )
        GpPrimaryButton(
            text = primary,
            onClick = onPrimary,
            enabled = primaryEnabled,
            busy = primaryBusy,
            modifier = Modifier.weight(1f).testTag(primaryTag),
        )
    }
}

/** Список вопросов «Проверки»: где ответ, где отметка; отсюда — к любому вопросу или «Закончить». */
@Composable
private fun OverviewPane(
    s: Screen,
    section: StudySection,
    actions: SessionActions,
) {
    val colors = Gp.colors
    val answered =
        s.training.answers.values
            .count { it.optionIds.isNotEmpty() }
    val flagged = (0 until s.training.total).count { s.flaggedAt(it) }
    Scaffold(
        containerColor = Color.Transparent,
        topBar = { SessionHeader(s, section, actions) },
        bottomBar = {
            BottomActions {
                ActionRow(
                    secondary = stringResource(R.string.overview_back, s.position + 1) to actions.onCloseOverview,
                    primary = stringResource(R.string.overview_finish),
                    onPrimary = actions.onFinish,
                    primaryTag = "overview.finish",
                    secondaryTag = "overview.back",
                )
            }
        },
    ) { padding ->
        SessionColumn(padding = padding, tag = "overview") {
            Text(
                text = stringResource(R.string.question_overview),
                style = Gp.type.title2,
                color = colors.text,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = stringResource(R.string.overview_summary, answered, s.training.total, flagged),
                style = Gp.type.subhead,
                color = colors.textSecondary,
            )
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(GpSpace.s12),
                verticalArrangement = Arrangement.spacedBy(GpSpace.s12),
            ) {
                repeat(s.training.total) { i -> OverviewCell(s, i, section, onClick = { actions.onGoTo(i) }) }
            }
        }
    }
}

@Composable
private fun OverviewCell(
    s: Screen,
    position: Int,
    section: StudySection,
    onClick: () -> Unit,
) {
    val colors = Gp.colors
    val answer = s.training.answer(position)
    val isAnswered = answer?.optionIds?.isNotEmpty() == true
    val isFlagged = s.flaggedAt(position)
    val state =
        listOfNotNull(
            stringResource(if (isAnswered) R.string.overview_answered else R.string.overview_empty),
            if (isFlagged) stringResource(R.string.overview_flagged) else null,
        ).joinToString(", ")
    val description = stringResource(R.string.overview_item, position + 1, state)
    Surface(
        onClick = onClick,
        color = if (isAnswered) section.tint(colors) else colors.surface,
        shape = CircleShape,
        border = BorderStroke(GpSize.hairline, if (position == s.position) section.color(colors) else colors.line),
        modifier = Modifier.size(GpSize.button).semantics { contentDescription = description }.testTag("overview.$position"),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = (position + 1).toString(),
                style = Gp.type.callout.copy(fontFeatureSettings = "tnum"),
                color = colors.text,
            )
            if (isFlagged) {
                Icon(
                    painter = painterResource(R.drawable.ic_flag_filled),
                    contentDescription = null,
                    tint = section.color(colors),
                    modifier = Modifier.align(Alignment.TopEnd).size(GpSpace.s14),
                )
            }
        }
    }
}

/** Итог (макет R15): «7 из 10 верно», сколько шла, что повторить; дальше — повтор по ошибкам или «Готово». */
@Composable
private fun SummaryPane(
    s: Screen,
    result: TrainingResult,
    section: StudySection,
    repeat: SessionViewModel.RepeatState,
    actions: SessionActions,
) {
    val colors = Gp.colors
    val mistakes = result.review.sumOf { it.mistakes }
    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            Row(modifier = Modifier.statusBarsPadding().height(GpSize.rowTall).padding(horizontal = GpSpace.s4)) {
                IconButton(onClick = actions.onClose, modifier = Modifier.testTag("session.close")) {
                    Icon(
                        painter = painterResource(R.drawable.ic_close),
                        contentDescription = stringResource(R.string.summary_done),
                        tint = colors.text,
                    )
                }
            }
        },
        bottomBar = {
            BottomActions(note = repeat.problem?.let { p -> { Note(startProblemText(p)) } }) {
                if (result.review.isEmpty()) {
                    GpPrimaryButton(
                        text = stringResource(R.string.summary_done),
                        onClick = actions.onClose,
                        modifier = Modifier.fillMaxWidth().testTag("summary.done"),
                    )
                } else {
                    val count = TrainingRules.repeatCount(mistakes)
                    ActionRow(
                        secondary = stringResource(R.string.summary_done) to actions.onClose,
                        primary =
                            stringResource(R.string.summary_repeat, pluralStringResource(R.plurals.questions_count, count, count)),
                        onPrimary = actions.onRepeat,
                        primaryBusy = repeat.starting,
                        primaryTag = "summary.repeat",
                        secondaryTag = "summary.done",
                    )
                }
            }
        },
    ) { padding ->
        SessionColumn(padding = padding, tag = "summary") {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(GpSpace.s12)) {
                Text(
                    text = result.correct.toString(),
                    style = Gp.type.score.copy(fontFeatureSettings = "tnum"),
                    color = colors.text,
                    modifier = Modifier.testTag("summary.correct"),
                )
                Text(
                    text = pluralStringResource(R.plurals.summary_correct_of, result.total, result.total),
                    style = Gp.title3,
                    color = colors.text,
                    modifier = Modifier.padding(bottom = GpSpace.s6),
                )
            }
            Text(text = summaryLine(s, result), style = Gp.type.subhead, color = colors.textSecondary)
            if (s.training.finish?.timedOut == true) {
                StatusLine(icon = R.drawable.ic_timer, text = stringResource(R.string.summary_timed_out))
            }
            if (result.review.isEmpty()) {
                // Ошибок темы нет, но вопросы могли остаться «не успел» — «без ошибок» при 1 из 3 звучало бы фальшиво.
                val text =
                    if (result.unanswered > 0) {
                        stringResource(
                            R.string.summary_ran_out,
                            pluralStringResource(R.plurals.questions_count, result.unanswered, result.unanswered),
                        )
                    } else {
                        stringResource(R.string.summary_perfect)
                    }
                Text(text = text, style = Gp.type.body, color = colors.text, modifier = Modifier.testTag("summary.noMistakes"))
            } else {
                Text(
                    text = stringResource(R.string.summary_review),
                    style = Gp.title3,
                    color = colors.text,
                    modifier = Modifier.padding(top = GpSpace.s8).semantics { heading() },
                )
                result.review.forEach { topic -> ReviewTopic(topic, section) }
            }
            LinkText(
                text = stringResource(R.string.summary_all_answers),
                onClick = actions.onReview,
                modifier = Modifier.testTag("summary.review"),
            )
        }
    }
}

@Composable
private fun ReviewTopic(
    topic: TopicReview,
    section: StudySection,
) {
    val english = LocalConfiguration.current.locales[0].language == "en"
    val and = stringResource(R.string.summary_and)
    val numbers = topic.positions.map { (it + 1).toString() }
    val list = if (numbers.size == 1) numbers[0] else numbers.dropLast(1).joinToString(", ") + " $and " + numbers.last()
    val where =
        if (numbers.size == 1) stringResource(R.string.summary_question, list) else stringResource(R.string.summary_questions, list)
    Row(horizontalArrangement = Arrangement.spacedBy(GpSpace.s12), verticalAlignment = Alignment.Top) {
        Box(Modifier.padding(top = GpSpace.s8).size(GpSpace.s8).background(section.color(Gp.colors), CircleShape))
        Column(verticalArrangement = Arrangement.spacedBy(GpSpace.s2)) {
            Text(text = topic.title.pick(english), style = Gp.type.headline, color = Gp.colors.text)
            Text(
                text = pluralStringResource(R.plurals.summary_mistakes, topic.mistakes, topic.mistakes) + " · " + where,
                style = Gp.type.subhead,
                color = Gp.colors.textSecondary,
            )
        }
    }
}

/** «Verbal · Text Completion · 11 минут», у «Проверки» — «Проверка · Verbal · 17 минут из 18». */
@Composable
private fun summaryLine(
    s: Screen,
    result: TrainingResult,
): String {
    val session = s.training.session
    val (minutes, limit) =
        TrainingRules.summaryMinutes(result.durationSeconds, if (s.training.isCheck) session.timeLimitSeconds else null)
    // «11 минут» не разрывается переносом строки.
    val duration = pluralStringResource(R.plurals.today_minutes, minutes, minutes).replace(' ', NBSP)
    val sectionLabel = session.section.study().label()
    return if (limit != null) {
        listOf(
            stringResource(R.string.mode_check),
            sectionLabel,
            stringResource(R.string.summary_of_limit, duration, limit),
        ).joinToString(" · ")
    } else {
        (listOf(sectionLabel) + session.questionTypes.map { it.label() } + duration).joinToString(" · ")
    }
}

/** Ссылка — подчёркнутый текст без стрелки (DESIGN.md, «Ссылки»), высотой с палец. */
@Composable
fun LinkText(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .heightIn(min = GpSize.tapTarget)
                .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(text = text, style = Gp.type.body.copy(textDecoration = TextDecoration.Underline), color = Gp.colors.text)
    }
}

@Composable
internal fun startProblemText(problem: StartProblem): String =
    stringResource(
        when (problem) {
            StartProblem.NoQuestions -> R.string.builder_no_questions
            StartProblem.Offline -> R.string.builder_start_offline
            StartProblem.Failed -> R.string.builder_start_failed
        },
    )
