package dev.greprepapp.app.feature.training

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.greprepapp.api.models.QuestionReport
import dev.greprepapp.api.models.QuestionType
import dev.greprepapp.app.R
import dev.greprepapp.app.ui.EmptyState
import dev.greprepapp.app.ui.NestedScreen
import dev.greprepapp.app.ui.label
import dev.greprepapp.design.Gp
import dev.greprepapp.design.GpPrimaryButton
import dev.greprepapp.design.StudySection
import greprep.design.GpLayout
import greprep.design.GpSize
import greprep.design.GpSpace

/** Разбор всей тренировки (макет R16): все вопросы или только ошибки; вопрос открывается с разбором. */
@Composable
fun ReviewScreen(
    trainingId: String,
    onBack: () -> Unit,
    onOpen: (Int) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ReviewViewModel =
        hiltViewModel<ReviewViewModel, ReviewViewModel.Factory>(key = trainingId) { it.create(trainingId) },
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ReviewContent(state = state, onBack = onBack, onOpen = onOpen, modifier = modifier)
}

@Composable
fun ReviewContent(
    state: ReviewViewModel.UiState,
    onBack: () -> Unit,
    onOpen: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val ready = state as? ReviewViewModel.UiState.Ready
    val title =
        stringResource(if (ready?.training?.isCheck == true) R.string.review_title_check else R.string.review_title_practice)
    NestedScreen(
        title = title,
        onBack = onBack,
        modifier = modifier,
        glow =
            ready
                ?.training
                ?.session
                ?.section
                ?.study(),
    ) { padding ->
        when (state) {
            ReviewViewModel.UiState.Loading -> Box(Modifier.fillMaxSize())
            ReviewViewModel.UiState.Missing -> MissingTraining(padding, onBack)
            is ReviewViewModel.UiState.Ready -> ReviewList(state, padding, onOpen)
        }
    }
}

@Composable
private fun MissingTraining(
    padding: PaddingValues,
    onBack: () -> Unit,
) {
    EmptyState(
        title = stringResource(R.string.training_missing_title),
        message = stringResource(R.string.training_missing_message),
        action = stringResource(R.string.summary_done),
        onAction = onBack,
        modifier = Modifier.padding(padding).testTag("review.missing"),
    )
}

/** Как ответил человек на вопрос: верно, неверно или без ответа. */
private enum class Outcome { Correct, Wrong, Unanswered }

private fun outcome(
    training: StoredTraining,
    position: Int,
): Outcome {
    val chosen = training.answer(position)?.optionIds.orEmpty()
    return when {
        chosen.isEmpty() -> Outcome.Unanswered
        TrainingRules.isCorrect(training.question(position), chosen) -> Outcome.Correct
        else -> Outcome.Wrong
    }
}

@Composable
private fun ReviewList(
    state: ReviewViewModel.UiState.Ready,
    padding: PaddingValues,
    onOpen: (Int) -> Unit,
) {
    val training = state.training
    val result = state.result
    val section = training.session.section.study()
    var onlyMistakes by rememberSaveable { mutableStateOf(false) }
    val mistakes = training.session.items.filter { outcome(training, it.position) != Outcome.Correct }
    val shown = if (onlyMistakes) mistakes else training.session.items
    val english = LocalConfiguration.current.locales[0].language == "en"
    Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.TopCenter) {
        LazyColumn(
            modifier = Modifier.widthIn(max = GpLayout.contentMax + GpLayout.gutter * 2).fillMaxWidth().testTag("review.list"),
            contentPadding = PaddingValues(horizontal = GpLayout.gutter, vertical = GpSpace.s8),
            verticalArrangement = Arrangement.spacedBy(GpSpace.s4),
        ) {
            item(key = "head") {
                Column(verticalArrangement = Arrangement.spacedBy(GpSpace.s16), modifier = Modifier.padding(bottom = GpSpace.s12)) {
                    Text(
                        text = "${result.correct} " + pluralStringResource(R.plurals.summary_correct_of, result.total, result.total),
                        style = Gp.type.subhead,
                        color = Gp.colors.textSecondary,
                    )
                    SegmentedChoice(
                        options =
                            listOf(
                                stringResource(R.string.review_all, training.total),
                                stringResource(R.string.review_mistakes, mistakes.size),
                            ),
                        selected = if (onlyMistakes) 1 else 0,
                        onSelect = { onlyMistakes = it == 1 },
                        tags = listOf("review.filter.all", "review.filter.mistakes"),
                    )
                }
            }
            if (shown.isEmpty()) {
                item(key = "none") { Text(stringResource(R.string.review_no_mistakes), style = Gp.type.body, color = Gp.colors.text) }
            }
            items(shown, key = { it.position }) { item ->
                ReviewRow(
                    number = item.position + 1,
                    type = item.question.questionType,
                    topic = item.question.topicTitle.pick(english),
                    outcome = outcome(training, item.position),
                    section = section,
                    onClick = { onOpen(item.position) },
                )
            }
        }
    }
}

@Composable
private fun ReviewRow(
    number: Int,
    type: QuestionType,
    topic: String,
    outcome: Outcome,
    section: StudySection,
    onClick: () -> Unit,
) {
    val colors = Gp.colors
    val state =
        stringResource(
            when (outcome) {
                Outcome.Correct -> R.string.review_correct
                Outcome.Wrong -> R.string.review_wrong
                Outcome.Unanswered -> R.string.review_unanswered
            },
        )
    val typeLabel = type.label()
    val description = "${stringResource(R.string.review_question, number)}, $state, $typeLabel, $topic"
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClick = onClick)
                .heightIn(min = GpSize.rowTall)
                .padding(vertical = GpSpace.s8)
                .semantics(mergeDescendants = true) { contentDescription = description }
                .testTag("review.item.${number - 1}"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(GpSpace.s14),
    ) {
        val (bg, fg) =
            when (outcome) {
                Outcome.Correct -> section.color(colors) to colors.surface
                Outcome.Wrong -> colors.wrong to colors.surface
                Outcome.Unanswered -> colors.surface to colors.textSecondary
            }
        Box(
            modifier =
                Modifier
                    .size(GpSize.stepNode)
                    .background(bg, CircleShape)
                    .then(if (outcome == Outcome.Unanswered) Modifier.border(GpSize.hairline, colors.line, CircleShape) else Modifier),
            contentAlignment = Alignment.Center,
        ) {
            Text(text = number.toString(), style = Gp.type.footnote.copy(fontWeight = FontWeight.W600), color = fg)
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(GpSpace.s2)) {
            Text(text = typeLabel, style = Gp.type.body.copy(fontWeight = FontWeight.W500, localeList = English), color = colors.text)
            Text(text = topic, style = Gp.type.subhead, color = colors.textSecondary)
        }
        Icon(
            painter = painterResource(R.drawable.ic_chevron_right),
            contentDescription = null,
            tint = colors.textSecondary,
            modifier = Modifier.size(GpSpace.s20),
        )
    }
}

/** Один вопрос с разбором — из итога тренировки; можно сообщить об ошибке. */
@Composable
fun ReviewItemScreen(
    trainingId: String,
    position: Int,
    onBack: () -> Unit,
    onReport: (ReportTarget) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ReviewViewModel =
        hiltViewModel<ReviewViewModel, ReviewViewModel.Factory>(key = trainingId) { it.create(trainingId) },
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ReviewItemContent(
        state = state,
        position = position,
        onBack = onBack,
        onReport = { (state as? ReviewViewModel.UiState.Ready)?.training?.let { onReport(it.reportTarget(position)) } },
        modifier = modifier,
    )
}

@Composable
fun ReviewItemContent(
    state: ReviewViewModel.UiState,
    position: Int,
    onBack: () -> Unit,
    onReport: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val ready = state as? ReviewViewModel.UiState.Ready
    val systemEnglish = LocalConfiguration.current.locales[0].language == "en"
    var english by rememberSaveable { mutableStateOf(systemEnglish) }
    var whyNotOpen by rememberSaveable { mutableStateOf(false) }
    NestedScreen(
        title = stringResource(R.string.review_question, position + 1),
        onBack = onBack,
        modifier = modifier,
        glow =
            ready
                ?.training
                ?.session
                ?.section
                ?.study(),
    ) { padding ->
        when (state) {
            ReviewViewModel.UiState.Loading -> {
                Box(Modifier.fillMaxSize())
            }

            ReviewViewModel.UiState.Missing -> {
                MissingTraining(padding, onBack)
            }

            is ReviewViewModel.UiState.Ready -> {
                val training = state.training
                val question = training.question(position.coerceIn(0, training.total - 1))
                val section = training.session.section.study()
                val answer = training.answer(position)
                Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.TopCenter) {
                    Column(
                        modifier =
                            Modifier
                                .widthIn(max = GpLayout.contentMax + GpLayout.gutter * 2)
                                .fillMaxWidth()
                                .verticalScroll(rememberScrollState())
                                .padding(horizontal = GpLayout.gutter, vertical = GpSpace.s8)
                                .testTag("reviewItem"),
                        verticalArrangement = Arrangement.spacedBy(GpSpace.s20),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = question.typeLabel(),
                                style = Gp.type.footnote,
                                color = section.color(Gp.colors),
                                modifier = Modifier.weight(1f),
                            )
                            TextButton(onClick = onReport, modifier = Modifier.testTag("question.report")) {
                                Text(stringResource(R.string.question_report), style = Gp.type.caption, color = Gp.colors.textSecondary)
                            }
                        }
                        when (question.questionType) {
                            QuestionType.QUANTITATIVE_COMPARISON -> {
                                Quantities(question)
                            }

                            QuestionType.MULTIPLE_CHOICE -> {
                                Text(question.prompt, style = Gp.type.prompt.copy(localeList = English), color = Gp.colors.text)
                            }

                            else -> {
                                PromptText(question = question, selection = question.answer, section = section)
                            }
                        }
                        RevealedOptions(question, answer?.optionIds.orEmpty(), section)
                        ExplanationPanel(
                            question = question,
                            answer = answer,
                            english = english,
                            whyNotOpen = whyNotOpen,
                            section = section,
                            onLanguage = { english = it },
                            onToggleWhyNot = { whyNotOpen = !whyNotOpen },
                            modifier = Modifier.padding(bottom = GpSpace.s32),
                        )
                    }
                }
            }
        }
    }
}

/** «Сообщить об ошибке» (макет R17): где ошибка, что не так, «Отправить»; после — «Спасибо». */
@Composable
fun ReportScreen(
    questionId: String,
    trainingId: String,
    position: Int,
    typeLabel: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ReportViewModel =
        hiltViewModel<ReportViewModel, ReportViewModel.Factory>(key = "$trainingId/$position") { it.create(questionId, trainingId) },
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ReportContent(
        state = state,
        position = position,
        typeLabel = typeLabel,
        onKind = viewModel::setKind,
        onText = viewModel::setText,
        onSend = viewModel::send,
        onBack = onBack,
        modifier = modifier,
    )
}

private val REPORT_KINDS =
    listOf(
        QuestionReport.Kind.QUESTION to R.string.report_kind_question,
        QuestionReport.Kind.ANSWER to R.string.report_kind_answer,
        QuestionReport.Kind.EXPLANATION to R.string.report_kind_explanation,
        QuestionReport.Kind.TRANSLATION to R.string.report_kind_translation,
        QuestionReport.Kind.OTHER to R.string.report_kind_other,
    )

@Composable
fun ReportContent(
    state: ReportViewModel.UiState,
    position: Int,
    typeLabel: String,
    onKind: (QuestionReport.Kind) -> Unit,
    onText: (String) -> Unit,
    onSend: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = Gp.colors
    NestedScreen(title = stringResource(R.string.report_title), onBack = onBack, modifier = modifier) { padding ->
        if (state.sent) {
            EmptyState(
                title = stringResource(R.string.report_thanks),
                message = stringResource(R.string.report_note),
                action = stringResource(R.string.report_back),
                onAction = onBack,
                modifier = Modifier.padding(padding).testTag("report.sent"),
            )
            return@NestedScreen
        }
        Column(modifier = Modifier.fillMaxSize().padding(padding).imePadding()) {
            Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                Column(
                    modifier =
                        Modifier
                            .widthIn(max = GpLayout.contentMax + GpLayout.gutter * 2)
                            .fillMaxWidth()
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = GpLayout.gutter, vertical = GpSpace.s8)
                            .testTag("report"),
                    verticalArrangement = Arrangement.spacedBy(GpSpace.s16),
                ) {
                    Text(
                        text = stringResource(R.string.report_context, position + 1, typeLabel),
                        style = Gp.type.subhead,
                        color = colors.textSecondary,
                    )
                    Text(
                        text = stringResource(R.string.report_kind),
                        style = Gp.type.body.copy(fontWeight = FontWeight.W500),
                        color = colors.text,
                    )
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(GpSpace.s8),
                        verticalArrangement = Arrangement.spacedBy(GpSpace.s8),
                    ) {
                        REPORT_KINDS.forEach { (kind, label) ->
                            FilterChip(
                                selected = state.kind == kind,
                                onClick = { onKind(kind) },
                                label = { Text(stringResource(label), style = Gp.type.subhead) },
                                colors =
                                    FilterChipDefaults.filterChipColors(
                                        containerColor = colors.surface,
                                        labelColor = colors.text,
                                        selectedContainerColor = colors.accent,
                                        selectedLabelColor = colors.onAccent,
                                    ),
                                modifier = Modifier.heightIn(min = GpSize.tapTarget).testTag("report.kind.${kind.value}"),
                            )
                        }
                    }
                    OutlinedTextField(
                        value = state.text,
                        onValueChange = onText,
                        label = { Text(stringResource(R.string.report_text)) },
                        minLines = 3,
                        textStyle = Gp.type.body,
                        colors =
                            OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = colors.surface,
                                unfocusedContainerColor = colors.surface,
                                focusedBorderColor = colors.focus,
                                unfocusedBorderColor = colors.line,
                                focusedTextColor = colors.text,
                                unfocusedTextColor = colors.text,
                                cursorColor = colors.text,
                                focusedLabelColor = colors.textSecondary,
                                unfocusedLabelColor = colors.textSecondary,
                            ),
                        modifier = Modifier.fillMaxWidth().testTag("report.text"),
                    )
                    Text(
                        text = stringResource(R.string.report_note),
                        style = Gp.type.footnote.copy(fontWeight = FontWeight.W400),
                        color = colors.textSecondary,
                        textAlign = TextAlign.Start,
                    )
                }
            }
            BottomActions {
                GpPrimaryButton(
                    text = stringResource(R.string.report_send),
                    onClick = onSend,
                    enabled = state.kind != null,
                    busy = state.sending,
                    modifier = Modifier.fillMaxWidth().testTag("report.send"),
                )
            }
        }
    }
}
