package dev.greprepapp.app.feature.training

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import dev.greprepapp.api.models.GivenAnswer
import dev.greprepapp.api.models.LocalizedText
import dev.greprepapp.api.models.Question
import dev.greprepapp.api.models.QuestionOption
import dev.greprepapp.api.models.QuestionType
import dev.greprepapp.api.models.Section
import dev.greprepapp.app.R
import dev.greprepapp.design.Gp
import dev.greprepapp.design.StudySection
import dev.greprepapp.design.pressScale
import greprep.design.GpRadius
import greprep.design.GpSize
import greprep.design.GpSpace

/** Текст задания и вариантов — английский: TalkBack читает его английским голосом. */
internal val English = LocaleList("en")

/** Пропуск в тексте задания (договор, Question.prompt). */
internal const val BLANK = "___"

/** Пустой пропуск в строке: четыре широких пробела, подчёркнутых, — видно место под слово. */
private const val BLANK_GAP = "    "

/** Римские номера пропусков, как в GRE: (i), (ii), (iii). */
internal val BLANK_NUMBERS = listOf("(i)", "(ii)", "(iii)")

fun Section.study(): StudySection = if (this == Section.QUANT) StudySection.Quant else StudySection.Verbal

@Composable
@ReadOnlyComposable
fun QuestionType.label(): String =
    stringResource(
        when (this) {
            QuestionType.TEXT_COMPLETION -> R.string.type_text_completion
            QuestionType.SENTENCE_EQUIVALENCE -> R.string.type_sentence_equivalence
            QuestionType.QUANTITATIVE_COMPARISON -> R.string.type_quantitative_comparison
            QuestionType.MULTIPLE_CHOICE -> R.string.type_multiple_choice
        },
    )

/** «Text Completion · три пропуска», «Sentence Equivalence · два ответа» — над заданием (макеты R5, R6). */
@Composable
@ReadOnlyComposable
fun Question.typeLabel(): String {
    val note =
        when {
            questionType == QuestionType.TEXT_COMPLETION && groups.size == 2 -> R.string.type_two_blanks
            questionType == QuestionType.TEXT_COMPLETION && groups.size == 3 -> R.string.type_three_blanks
            questionType == QuestionType.SENTENCE_EQUIVALENCE -> R.string.type_two_answers
            else -> null
        } ?: return questionType.label()
    return stringResource(R.string.type_with_note, questionType.label(), stringResource(note))
}

fun LocalizedText.pick(english: Boolean): String = if (english) en else ru

/** Разметка разборов: *слово* — курсивом (английские слова в русском тексте, договор Explanation). */
fun richText(text: String): AnnotatedString =
    buildAnnotatedString {
        var rest = text
        while (true) {
            val start = rest.indexOf('*')
            val end = if (start >= 0) rest.indexOf('*', start + 1) else -1
            if (start < 0 || end < 0) {
                append(rest)
                break
            }
            append(rest.substring(0, start))
            withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(rest.substring(start + 1, end)) }
            rest = rest.substring(end + 1)
        }
    }

/** Как вариант отмечен на экране. */
enum class OptionMark { None, Selected, Correct, Wrong }

/**
 * Вариант ответа (компонент answer-option): строка на плотной поверхности; выбранный — подложка цвета раздела и
 * обводка; после проверки — «верный» цветом раздела с галочкой и «ваш ответ» оранжевым с крестиком (DESIGN.md,
 * «Правило двух цветов ошибки»).
 */
@Composable
fun OptionRow(
    option: QuestionOption,
    mark: OptionMark,
    section: StudySection,
    modifier: Modifier = Modifier,
    letter: String? = option.id,
    multiple: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    val colors = Gp.colors
    val accent = section.color(colors)
    val container =
        when (mark) {
            OptionMark.Selected, OptionMark.Correct -> section.tint(colors)
            else -> colors.surface
        }
    val interaction = remember { MutableInteractionSource() }
    val markText =
        when (mark) {
            OptionMark.Correct -> stringResource(R.string.question_correct_mark)
            OptionMark.Wrong -> stringResource(R.string.question_yours_mark)
            else -> null
        }
    val clickable =
        if (onClick != null) {
            Modifier
                .pressScale(interaction)
                .selectable(
                    selected = mark == OptionMark.Selected,
                    interactionSource = interaction,
                    indication = ripple(),
                    role = if (multiple) Role.Checkbox else Role.RadioButton,
                    onClick = onClick,
                )
        } else {
            Modifier.semantics(mergeDescendants = true) { if (markText != null) stateDescription = markText }
        }
    Surface(
        color = container,
        shape = RoundedCornerShape(GpRadius.lg),
        border = if (mark == OptionMark.Selected) BorderStroke(GpSize.hairline, accent) else null,
        modifier = modifier.fillMaxWidth().then(clickable).testTag("option.${option.id}"),
    ) {
        Row(
            modifier = Modifier.heightIn(min = GpSize.row).padding(horizontal = GpSpace.s12, vertical = GpSpace.s8),
            horizontalArrangement = Arrangement.spacedBy(GpSpace.s12),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (letter != null) LetterBadge(letter, mark, accent)
            Text(
                text = option.text,
                style =
                    Gp.type.body.copy(
                        localeList = English,
                        fontWeight = if (mark == OptionMark.None) FontWeight.W400 else FontWeight.W500,
                    ),
                color = colors.text,
                modifier = Modifier.weight(1f),
            )
            if (markText != null) {
                val markColor = if (mark == OptionMark.Correct) accent else colors.wrong
                Text(text = markText, style = Gp.type.footnote, color = markColor)
                MarkDot(correct = mark == OptionMark.Correct, color = markColor)
            }
        }
    }
}

@Composable
private fun LetterBadge(
    letter: String,
    mark: OptionMark,
    accent: Color,
) {
    val colors = Gp.colors
    val (bg, fg) =
        when (mark) {
            OptionMark.Selected -> accent to colors.surface
            OptionMark.Correct -> colors.surface to accent
            else -> colors.fill to colors.textSecondary
        }
    Box(
        modifier = Modifier.size(GpSize.stepNode).background(bg, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = letter, style = Gp.type.footnote.copy(fontWeight = FontWeight.W600), color = fg)
    }
}

/** Вариант пропуска Text Completion (макет R5): компактная капсула, выбранная — подложка цвета раздела. */
@Composable
fun OptionChip(
    option: QuestionOption,
    selected: Boolean,
    section: StudySection,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = Gp.colors
    val interaction = remember { MutableInteractionSource() }
    Surface(
        color = if (selected) section.tint(colors) else colors.surface,
        shape = RoundedCornerShape(GpRadius.lg),
        border = if (selected) BorderStroke(GpSize.hairline, section.color(colors)) else null,
        modifier =
            modifier
                .pressScale(interaction)
                .selectable(
                    selected = selected,
                    interactionSource = interaction,
                    indication = ripple(),
                    role = Role.RadioButton,
                    onClick = onClick,
                ).testTag("option.${option.id}"),
    ) {
        Box(
            modifier = Modifier.heightIn(min = GpSize.tapTarget).padding(horizontal = GpSpace.s14),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = option.text,
                style =
                    Gp.type.callout.copy(
                        localeList = English,
                        fontWeight = if (selected) FontWeight.W500 else FontWeight.W400,
                    ),
                color = colors.text,
            )
        }
    }
}

/** Галочка или крестик в кружке — верно или неверно. */
@Composable
fun MarkDot(
    correct: Boolean,
    color: Color,
    modifier: Modifier = Modifier,
    size: Dp = GpSpace.s20,
) {
    Box(
        modifier = modifier.size(size).background(color, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painter = painterResource(if (correct) R.drawable.ic_check else R.drawable.ic_close),
            contentDescription = null,
            tint = Gp.colors.surface,
            modifier = Modifier.size(size * 2 / 3),
        )
    }
}

/**
 * Текст задания с пропусками. Где пропусков несколько, выбранное слово сразу встаёт в свой пропуск — фраза
 * читается целиком (макет R5); у одного пропуска место остаётся пустым, варианты — под текстом.
 */
@Composable
fun PromptText(
    question: Question,
    selection: List<String>,
    section: StudySection,
    modifier: Modifier = Modifier,
) {
    val colors = Gp.colors
    val accent = section.color(colors)
    val blank = stringResource(R.string.question_blank)
    val parts = question.prompt.split(BLANK)
    val many = question.groups.size > 1
    val text =
        buildAnnotatedString {
            parts.forEachIndexed { i, part ->
                append(part)
                if (i == parts.lastIndex) return@forEachIndexed
                if (many) {
                    withStyle(SpanStyle(fontSize = Gp.type.key.fontSize, color = colors.textSecondary)) {
                        append(BLANK_NUMBERS.getOrElse(i) { "" })
                    }
                }
                val chosen =
                    question.groups
                        .getOrNull(i)
                        ?.options
                        ?.firstOrNull { it.id in selection }
                if (many && chosen != null) {
                    withStyle(SpanStyle(color = accent, fontWeight = FontWeight.W500)) { append(chosen.text) }
                } else {
                    withStyle(SpanStyle(textDecoration = TextDecoration.Underline, color = colors.textSecondary)) { append(BLANK_GAP) }
                }
            }
        }
    // Для TalkBack пропуск — словом, а не пробелами.
    val spoken =
        parts.foldIndexed("") { i, acc, part ->
            acc + part + if (i < parts.lastIndex) " $blank ${if (many) BLANK_NUMBERS.getOrElse(i) { "" } else ""} " else ""
        }
    Text(
        text = text,
        style = Gp.type.prompt.copy(localeList = English),
        color = colors.text,
        modifier = modifier.fillMaxWidth().semantics { contentDescription = spoken }.testTag("question.prompt"),
    )
}

/**
 * Разбор после ответа (макет R4): узел-вердикт на нити слева, одна фраза «Верно» или «Неверно. Верный ответ —
 * A, equivocal», объяснение ключа; второй уровень — «Почему не …?» по нажатию; язык — переключатель RU/EN рядом
 * (PRODUCT.md, «Разбор ошибок»).
 */
@Composable
fun ExplanationPanel(
    question: Question,
    answer: GivenAnswer?,
    english: Boolean,
    whyNotOpen: Boolean,
    section: StudySection,
    onLanguage: (Boolean) -> Unit,
    onToggleWhyNot: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = Gp.colors
    val chosen = answer?.optionIds.orEmpty()
    val correct = chosen.isNotEmpty() && TrainingRules.isCorrect(question, chosen)
    val wrongChosen = chosen.filterNot { it in question.answer }
    val whyNot = question.explanation.options.filter { it.optionId in wrongChosen }
    Row(modifier = modifier.fillMaxWidth().height(IntrinsicSize.Min).testTag("explanation")) {
        Column(
            modifier = Modifier.width(GpSize.stepNode).fillMaxHeight(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            MarkDot(correct = correct, color = if (correct) section.color(colors) else colors.wrong, size = GpSize.stepNode)
            Box(
                Modifier
                    .padding(top = GpSpace.s4)
                    .width(GpSize.stepLine)
                    .weight(1f)
                    .background(colors.line),
            )
        }
        Column(
            modifier = Modifier.weight(1f).padding(start = GpSpace.s14),
            verticalArrangement = Arrangement.spacedBy(GpSpace.s12),
        ) {
            Text(
                text = verdict(question, correct, chosen.isEmpty(), english),
                style = Gp.type.body,
                color = colors.text,
                modifier = Modifier.padding(top = GpSpace.s2).testTag("explanation.verdict"),
            )
            Text(
                text = richText(question.explanation.solution.pick(english)),
                style = Gp.type.bodyLong.withLanguage(english),
                color = colors.text,
                modifier = Modifier.testTag("explanation.solution"),
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(GpSpace.s8),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (whyNot.isNotEmpty()) {
                    WhyNotChip(
                        text = whyNotLabel(question, wrongChosen, english),
                        open = whyNotOpen,
                        onClick = onToggleWhyNot,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                }
                LanguageSwitch(english = english, onChange = onLanguage)
            }
            if (whyNotOpen) {
                whyNot.forEach { item ->
                    Surface(
                        color = colors.surface,
                        shape = RoundedCornerShape(GpRadius.xl),
                        modifier = Modifier.fillMaxWidth().testTag("explanation.whyNot"),
                    ) {
                        Text(
                            text = richText(item.text.pick(english)),
                            style = Gp.type.subhead.withLanguage(english),
                            color = colors.text,
                            modifier = Modifier.padding(GpSpace.s16),
                        )
                    }
                }
            }
        }
    }
}

private fun TextStyle.withLanguage(english: Boolean): TextStyle = if (english) copy(localeList = English) else this

/** «Неверно. Верный ответ — A, equivocal.» на языке разбора. */
@Composable
private fun verdict(
    question: Question,
    correct: Boolean,
    unanswered: Boolean,
    english: Boolean,
): AnnotatedString {
    val lead =
        when {
            correct -> stringResource(if (english) R.string.verdict_correct_en else R.string.verdict_correct_ru)
            unanswered -> null
            else -> stringResource(if (english) R.string.verdict_wrong_en else R.string.verdict_wrong_ru)
        }
    val and = stringResource(if (english) R.string.verdict_and_en else R.string.verdict_and_ru)
    val keys = answerList(question, and)
    val key =
        stringResource(
            when {
                english && question.answer.size > 1 -> R.string.verdict_answers_en
                english -> R.string.verdict_answer_en
                question.answer.size > 1 -> R.string.verdict_answers_ru
                else -> R.string.verdict_answer_ru
            },
            keys,
        )
    return buildAnnotatedString {
        if (lead != null) {
            withStyle(SpanStyle(fontWeight = FontWeight.W600)) { append(lead) }
        }
        if (!correct) {
            if (lead != null) append(' ')
            append(key)
        }
    }
}

/** «A, equivocal», «A, intransigent и C, obdurate»; в Text Completion с пропусками — слова по порядку. */
private fun answerList(
    question: Question,
    and: String,
): String {
    val options = question.groups.flatMap { it.options }.associateBy { it.id }
    val many = question.groups.size > 1
    val items = question.answer.mapNotNull { id -> options[id]?.let { if (many) it.text else "$id, ${it.text}" } }
    return if (items.size <= 1) items.joinToString() else items.dropLast(1).joinToString(", ") + " $and " + items.last()
}

@Composable
private fun whyNotLabel(
    question: Question,
    wrong: List<String>,
    english: Boolean,
): String {
    val options = question.groups.flatMap { it.options }.associateBy { it.id }
    val words = wrong.mapNotNull { options[it]?.text }.joinToString(", ")
    return stringResource(if (english) R.string.why_not_en else R.string.why_not_ru, words)
}

@Composable
private fun WhyNotChip(
    text: String,
    open: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = Gp.colors
    val interaction = remember { MutableInteractionSource() }
    Surface(
        onClick = onClick,
        color = colors.fill,
        shape = CircleShape,
        interactionSource = interaction,
        modifier =
            modifier
                .heightIn(min = GpSize.tapTarget)
                .pressScale(interaction)
                .testTag("explanation.whyNotToggle"),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = GpSpace.s16),
            horizontalArrangement = Arrangement.spacedBy(GpSpace.s6),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = text,
                style = Gp.type.subhead.copy(fontWeight = FontWeight.W500),
                color = colors.text,
                maxLines = 2,
                modifier = Modifier.weight(1f, fill = false),
            )
            Icon(
                painter = painterResource(R.drawable.ic_expand_more),
                contentDescription = null,
                tint = colors.textSecondary,
                modifier = Modifier.size(GpSpace.s20).rotate(if (open) HALF_TURN else 0f),
            )
        }
    }
}

/** RU/EN — по сегменту в ширину кнопки: рядом остаётся место для «Почему не …?». */
private val LanguageSwitchWidth = GpSize.button * 2

/** Стрелка «развернуть» вверх, когда второй уровень разбора открыт. */
private const val HALF_TURN = 180f

@Composable
private fun LanguageSwitch(
    english: Boolean,
    onChange: (Boolean) -> Unit,
) {
    val label = stringResource(R.string.explanation_language)
    SegmentedChoice(
        options = listOf(stringResource(R.string.language_ru), stringResource(R.string.language_en)),
        selected = if (english) 1 else 0,
        onSelect = { onChange(it == 1) },
        modifier = Modifier.width(LanguageSwitchWidth).semantics { contentDescription = label }.testTag("explanation.language"),
    )
}

/**
 * Переключатель из нескольких вариантов (Material SegmentedButton в наших цветах): выбранный — на плотной
 * поверхности, без системной галочки (DESIGN.md, «Chips»).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SegmentedChoice(
    options: List<String>,
    selected: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
    tags: List<String>? = null,
) {
    val colors = Gp.colors
    SingleChoiceSegmentedButtonRow(modifier = modifier) {
        options.forEachIndexed { i, text ->
            SegmentedButton(
                selected = i == selected,
                onClick = { onSelect(i) },
                shape = SegmentedButtonDefaults.itemShape(index = i, count = options.size),
                colors =
                    SegmentedButtonDefaults.colors(
                        activeContainerColor = colors.surface,
                        activeContentColor = colors.text,
                        activeBorderColor = colors.line,
                        inactiveContainerColor = colors.fill,
                        inactiveContentColor = colors.textSecondary,
                        inactiveBorderColor = colors.line,
                    ),
                icon = {},
                modifier = tags?.getOrNull(i)?.let { Modifier.testTag(it) } ?: Modifier,
            ) {
                Text(
                    text = text,
                    style = Gp.type.subhead.copy(fontWeight = if (i == selected) FontWeight.W600 else FontWeight.W500),
                    maxLines = 1,
                )
            }
        }
    }
}
