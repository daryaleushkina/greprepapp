package dev.greprepapp.app.feature.training

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.greprepapp.api.models.Difficulty
import dev.greprepapp.api.models.Section
import dev.greprepapp.api.models.TrainingMode
import dev.greprepapp.api.models.TrainingOptions
import dev.greprepapp.api.models.TrainingPreset
import dev.greprepapp.app.R
import dev.greprepapp.app.feature.training.BuilderViewModel.Content
import dev.greprepapp.app.feature.training.BuilderViewModel.UiState
import dev.greprepapp.app.ui.EmptyState
import dev.greprepapp.app.ui.LoadingState
import dev.greprepapp.app.ui.NestedScreen
import dev.greprepapp.app.ui.StatusLine
import dev.greprepapp.app.ui.label
import dev.greprepapp.design.Gp
import dev.greprepapp.design.GpPrimaryButton
import greprep.design.GpLayout
import greprep.design.GpRadius
import greprep.design.GpSize
import greprep.design.GpSpace

/** Поле «Вопросов» — капсула под две цифры (DESIGN.md, «Число»). */
private val CountFieldWidth = GpSpace.s72 + GpSpace.s4

/** Действия конструктора одним набором — снимки экранов подставляют пустые. */
class BuilderActions(
    val onBack: () -> Unit = {},
    val onRetry: () -> Unit = {},
    val onPreset: (Int) -> Unit = {},
    val onSection: (Section) -> Unit = {},
    val onType: (dev.greprepapp.api.models.QuestionType) -> Unit = {},
    val onCount: (String) -> Unit = {},
    val onMode: (TrainingMode) -> Unit = {},
    val onTopics: () -> Unit = {},
    val onCloseTopics: () -> Unit = {},
    val onToggleTopic: (String) -> Unit = {},
    val onDifficulty: (Difficulty?) -> Unit = {},
    val onStart: () -> Unit = {},
)

/** Конструктор тренировки (макеты R1, R2). */
@Composable
fun BuilderScreen(
    prefill: BuilderPrefill?,
    onBack: () -> Unit,
    onStarted: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: BuilderViewModel =
        hiltViewModel<BuilderViewModel, BuilderViewModel.Factory>(key = prefill.toString()) { it.create(prefill) },
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.started) {
        state.started?.let {
            viewModel.consumeStarted()
            onStarted(it)
        }
    }
    BackHandler(enabled = state.editingTopics, onBack = viewModel::closeTopics)
    BuilderContent(
        state = state,
        actions =
            BuilderActions(
                onBack = onBack,
                onRetry = viewModel::load,
                onPreset = viewModel::selectPreset,
                onSection = viewModel::setSection,
                onType = viewModel::setType,
                onCount = viewModel::setCount,
                onMode = viewModel::setMode,
                onTopics = viewModel::openTopics,
                onCloseTopics = viewModel::closeTopics,
                onToggleTopic = viewModel::toggleTopic,
                onDifficulty = viewModel::setDifficulty,
                onStart = viewModel::start,
            ),
        modifier = modifier,
    )
}

@Composable
fun BuilderContent(
    state: UiState,
    actions: BuilderActions,
    modifier: Modifier = Modifier,
) {
    TrainingKeyboard(onKey = { key ->
        if (key == Key.Enter && !state.starting && state.content is Content.Ready) {
            if (state.editingTopics) {
                actions.onCloseTopics()
            } else if (BuilderViewModel.requestOf(state.content) != null) {
                actions.onStart()
            }
            true
        } else {
            false
        }
    }, modifier = modifier) {
        val content = state.content
        if (state.editingTopics && content is Content.Ready) {
            TopicsContent(content, actions)
            return@TrainingKeyboard
        }
        NestedScreen(title = stringResource(R.string.training_new), onBack = actions.onBack) { padding ->
            when (content) {
                Content.Loading -> {
                    LoadingState(
                        text = stringResource(R.string.training_loading),
                        modifier = Modifier.padding(padding).testTag("builder.loading"),
                    )
                }

                is Content.Unavailable -> {
                    val offline = content.problem == TrainingProblem.Offline
                    EmptyState(
                        title = stringResource(if (offline) R.string.training_offline_title else R.string.training_failed_title),
                        message = stringResource(if (offline) R.string.training_offline_message else R.string.training_failed_message),
                        icon = if (offline) R.drawable.ic_wifi_off else R.drawable.ic_error,
                        action = stringResource(R.string.training_retry),
                        onAction = actions.onRetry,
                        modifier = Modifier.padding(padding).testTag("builder.unavailable"),
                    )
                }

                is Content.Ready -> {
                    BuilderForm(content, state, actions, padding)
                }
            }
        }
    }
}

@Composable
private fun BuilderForm(
    c: Content.Ready,
    state: UiState,
    actions: BuilderActions,
    padding: PaddingValues,
) {
    val request = BuilderViewModel.requestOf(c)
    Column(modifier = Modifier.fillMaxSize().padding(padding).imePadding()) {
        Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            if (Gp.isWide) {
                TrainingSplit(PaddingValues(), "builder", left = {
                    if (c.presets.isNotEmpty()) Presets(c, actions.onPreset)
                    state.problem?.let {
                        BuilderProblem(it)
                    }
                }, right = { CustomCard(c, actions) })
            } else {
                Column(
                    modifier =
                        Modifier
                            .widthIn(max = GpLayout.contentMax + GpLayout.gutter * 2)
                            .fillMaxWidth()
                            .verticalScroll(
                                rememberScrollState(),
                            ).padding(horizontal = GpLayout.gutter, vertical = GpSpace.s8)
                            .testTag("builder.form"),
                    verticalArrangement = Arrangement.spacedBy(GpSpace.s24),
                ) {
                    if (c.presets.isNotEmpty()) Presets(c, actions.onPreset)
                    CustomCard(c, actions)
                    state.problem?.let {
                        BuilderProblem(it)
                    }
                }
            }
        }
        BottomActions(note = { KeyHint("Enter", stringResource(R.string.keyboard_start)) }) {
            val label =
                if (request == null) {
                    stringResource(R.string.builder_nothing)
                } else {
                    stringResource(
                        R.string.builder_start,
                        pluralStringResource(R.plurals.questions_count, request.count, request.count),
                        BuilderViewModel.minutes(c.options, request),
                    )
                }
            GpPrimaryButton(
                text = label,
                onClick = actions.onStart,
                enabled = request != null,
                busy = state.starting,
                modifier = Modifier.fillMaxWidth().testTag("builder.start"),
            )
        }
    }
}

@Composable
private fun BuilderProblem(problem: StartProblem) {
    StatusLine(
        icon = if (problem == StartProblem.Offline) R.drawable.ic_wifi_off else R.drawable.ic_error,
        text = startProblemText(problem),
        modifier = Modifier.testTag("builder.problem"),
    )
}

/** Готовые наборы — переключателем: выбранный уже стоит, «Начать» начнёт его (макет R1). */
@Composable
private fun Presets(
    c: Content.Ready,
    onSelect: (Int) -> Unit,
) {
    Group(modifier = Modifier.selectableGroup()) {
        c.presets.forEachIndexed { i, preset ->
            if (i > 0) Divider()
            val selected = c.preset == i
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .selectable(selected = selected, role = Role.RadioButton, onClick = { onSelect(i) })
                        .heightIn(min = GpSize.rowTall)
                        .padding(start = GpSpace.s16, end = GpSpace.s8, top = GpSpace.s8, bottom = GpSpace.s8)
                        .testTag("builder.preset.${preset.kind}"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(GpSpace.s2)) {
                    Text(text = presetTitle(preset), style = Gp.type.body.copy(fontWeight = FontWeight.W500), color = Gp.colors.text)
                    Text(
                        text = presetSubtitle(preset, c.options),
                        style = Gp.type.footnote.copy(fontWeight = FontWeight.W400),
                        color = Gp.colors.textSecondary,
                    )
                }
                RadioButton(
                    selected = selected,
                    onClick = null,
                    colors = RadioButtonDefaults.colors(selectedColor = Gp.colors.accent, unselectedColor = Gp.colors.line),
                )
            }
        }
    }
}

@Composable
private fun presetTitle(preset: TrainingPreset): String =
    stringResource(if (preset.kind == BuilderViewModel.PRESET_LAST) R.string.builder_preset_last else R.string.builder_preset_timed)

/** «Verbal · Text Completion · 10 · Практика»; у «Проверки на время» — «Verbal · 12 вопросов · 18 мин, как секция экзамена». */
@Composable
private fun presetSubtitle(
    preset: TrainingPreset,
    options: TrainingOptions,
): String {
    val r = preset.request
    val section = r.section.study().label()
    if (preset.kind == BuilderViewModel.PRESET_TIMED) {
        return stringResource(
            R.string.builder_preset_timed_subtitle,
            section,
            pluralStringResource(R.plurals.questions_count, r.count, r.count),
            BuilderViewModel.minutes(options, r),
        )
    }
    val mode = stringResource(if (r.mode == TrainingMode.CHECK) R.string.mode_check else R.string.mode_practice)
    return (listOf(section) + r.questionTypes.map { it.label() } + r.count.toString() + mode).joinToString(" · ")
}

/** Своя сборка: без рубрики, поля показывают то, что выбрано (макет R1). */
@Composable
private fun CustomCard(
    c: Content.Ready,
    actions: BuilderActions,
) {
    val f = c.form
    Group {
        FieldRow(label = stringResource(R.string.builder_section)) {
            SegmentedChoice(
                options = listOf(stringResource(R.string.section_verbal), stringResource(R.string.section_quant)),
                selected = if (f.section == Section.QUANT) 1 else 0,
                onSelect = { actions.onSection(if (it == 1) Section.QUANT else Section.VERBAL) },
                tags = listOf("builder.section.verbal", "builder.section.quant"),
            )
        }
        Divider()
        TypeRow(c, actions)
        Divider()
        val countLabel = stringResource(R.string.builder_count)
        FieldRow(label = countLabel) {
            CountField(text = f.countText, label = countLabel, onChange = actions.onCount)
        }
        Divider()
        Column(modifier = Modifier.padding(bottom = GpSpace.s12)) {
            FieldRow(label = stringResource(R.string.builder_mode)) {
                SegmentedChoice(
                    options = listOf(stringResource(R.string.mode_practice), stringResource(R.string.mode_check)),
                    selected = if (f.mode == TrainingMode.CHECK) 1 else 0,
                    onSelect = { actions.onMode(if (it == 1) TrainingMode.CHECK else TrainingMode.PRACTICE) },
                    tags = listOf("builder.mode.practice", "builder.mode.check"),
                )
            }
            Text(
                text = stringResource(if (f.mode == TrainingMode.CHECK) R.string.mode_check_hint else R.string.mode_practice_hint),
                style = Gp.type.footnote.copy(fontWeight = FontWeight.W400),
                color = Gp.colors.textSecondary,
                modifier = Modifier.padding(horizontal = GpSpace.s16),
            )
        }
        Divider()
        val topics = BuilderViewModel.topicsOf(c.options, f)
        val selected = f.topicIds?.size ?: topics.size
        LinkRow(
            label = stringResource(R.string.builder_topics),
            value =
                if (f.topicIds == null) {
                    stringResource(R.string.builder_topics_all)
                } else {
                    stringResource(R.string.builder_topics_some, selected, topics.size)
                },
            onClick = actions.onTopics,
            enabled = topics.isNotEmpty(),
            tag = "builder.topics",
        )
    }
}

/** «Тип» — меню Material у строки: на Android это родной выбор из короткого списка. */
@Composable
private fun TypeRow(
    c: Content.Ready,
    actions: BuilderActions,
) {
    var open by remember { mutableStateOf(false) }
    val types = c.options.types.filter { it.section == c.form.section }
    Box {
        LinkRow(
            label = stringResource(R.string.builder_type),
            value = c.form.type.label(),
            onClick = { open = true },
            tag = "builder.type",
            valueStyle = Gp.type.callout.copy(fontWeight = FontWeight.W400, localeList = English),
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            types.forEach { t ->
                val empty = t.topics.isEmpty()
                DropdownMenuItem(
                    text = {
                        Text(
                            text =
                                if (empty) {
                                    "${t.questionType.label()} · ${stringResource(
                                        R.string.builder_type_soon,
                                    )}"
                                } else {
                                    t.questionType.label()
                                },
                            style = Gp.type.body,
                        )
                    },
                    enabled = !empty,
                    onClick = {
                        open = false
                        actions.onType(t.questionType)
                    },
                    modifier = Modifier.testTag("builder.type.${t.questionType.value}"),
                )
            }
        }
    }
}

/** «Вопросов» — капсула на fill с числом по центру, любое значение (DESIGN.md, «Число»). */
@Composable
private fun CountField(
    text: String,
    label: String,
    onChange: (String) -> Unit,
) {
    val colors = Gp.colors
    BasicTextField(
        value = text,
        onValueChange = onChange,
        singleLine = true,
        textStyle =
            Gp.type.body.copy(
                color = colors.text,
                fontWeight = FontWeight.W600,
                textAlign = TextAlign.Center,
                fontFeatureSettings = "tnum",
            ),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        cursorBrush = SolidColor(colors.text),
        modifier =
            Modifier
                .width(CountFieldWidth)
                .height(GpSpace.s40)
                .semantics { contentDescription = label }
                .testTag("builder.count"),
        decorationBox = { field ->
            Box(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .background(colors.fill, CircleShape)
                        .border(GpSize.hairline, colors.line, CircleShape),
                contentAlignment = Alignment.Center,
            ) { field() }
        },
    )
}

/** Секция-список на плотной поверхности (компонент card). */
@Composable
private fun Group(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Surface(color = Gp.colors.surface, shape = RoundedCornerShape(GpRadius.xxl), modifier = modifier.fillMaxWidth()) {
        Column { content() }
    }
}

@Composable
private fun Divider() {
    HorizontalDivider(thickness = GpSize.hairline / 2, color = Gp.colors.line, modifier = Modifier.padding(start = GpSpace.s16))
}

@Composable
private fun FieldRow(
    label: String,
    control: @Composable () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = GpSize.rowTall).padding(horizontal = GpSpace.s16, vertical = GpSpace.s8),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(GpSpace.s12),
    ) {
        Text(text = label, style = Gp.type.body, color = Gp.colors.text, modifier = Modifier.weight(1f))
        control()
    }
}

/** Строка, открывающая выбор: значение справа и стрелка — она ведёт дальше (DESIGN.md, «Ссылки»). */
@Composable
private fun LinkRow(
    label: String,
    value: String,
    onClick: () -> Unit,
    tag: String,
    enabled: Boolean = true,
    valueStyle: TextStyle = Gp.type.callout.copy(fontWeight = FontWeight.W400),
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .heightIn(min = GpSize.rowTall)
                .padding(start = GpSpace.s16, end = GpSpace.s12)
                .semantics(mergeDescendants = true) { contentDescription = "$label: $value" }
                .testTag(tag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(GpSpace.s8),
    ) {
        Text(text = label, style = Gp.type.body, color = Gp.colors.text, modifier = Modifier.weight(1f))
        Text(text = value, style = valueStyle, color = Gp.colors.textSecondary)
        Icon(
            painter = painterResource(R.drawable.ic_chevron_right),
            contentDescription = null,
            tint = Gp.colors.textSecondary,
            modifier = Modifier.size(GpSpace.s20),
        )
    }
}

/** «Темы и сложность» (макет R2): галочки тем с числом заданий и сложность; «Готово» — сколько заданий выйдет. */
@Composable
private fun TopicsContent(
    c: Content.Ready,
    actions: BuilderActions,
    modifier: Modifier = Modifier,
) {
    val f = c.form
    val topics = BuilderViewModel.topicsOf(c.options, f)
    val available = BuilderViewModel.available(c.options, f)
    val english = LocalConfiguration.current.locales[0].language == "en"
    val topicList: @Composable () -> Unit = {
        Text(
            text = (listOf(f.section.study().label(), f.type.label())).joinToString(" · "),
            style = Gp.type.subhead,
            color = Gp.colors.textSecondary,
        )
        Group {
            topics.forEachIndexed { i, topic ->
                if (i > 0) Divider()
                val checked = f.topicIds == null || topic.id in f.topicIds
                val count =
                    when (f.difficulty) {
                        null -> topic.available.easy + topic.available.medium + topic.available.hard
                        Difficulty.EASY -> topic.available.easy
                        Difficulty.MEDIUM -> topic.available.medium
                        Difficulty.HARD -> topic.available.hard
                    }
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .toggleable(
                                value = checked,
                                role = Role.Checkbox,
                                onValueChange = { actions.onToggleTopic(topic.id) },
                            ).heightIn(min = GpSize.rowTall)
                            .padding(start = GpSpace.s16, end = GpSpace.s8)
                            .testTag("topic.${topic.id}"),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(GpSpace.s8),
                ) {
                    Text(
                        text = topic.title.pick(english),
                        style = Gp.type.body,
                        color = Gp.colors.text,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = count.toString(),
                        style = Gp.type.subhead.copy(fontFeatureSettings = "tnum"),
                        color = Gp.colors.textSecondary,
                    )
                    Checkbox(
                        checked = checked,
                        onCheckedChange = null,
                        colors = CheckboxDefaults.colors(checkedColor = Gp.colors.accent, checkmarkColor = Gp.colors.onAccent),
                    )
                }
            }
        }
    }
    val difficulty: @Composable () -> Unit = {
        Text(text = stringResource(R.string.topics_difficulty), style = Gp.type.subhead, color = Gp.colors.textSecondary)
        SegmentedChoice(
            options =
                listOf(
                    stringResource(R.string.difficulty_any),
                    stringResource(R.string.difficulty_easy),
                    stringResource(R.string.difficulty_medium),
                    stringResource(R.string.difficulty_hard),
                ),
            selected = DIFFICULTIES.indexOf(f.difficulty),
            onSelect = { actions.onDifficulty(DIFFICULTIES[it]) },
            modifier = Modifier.fillMaxWidth(),
            tags = DIFFICULTIES.map { "topics.difficulty.${it?.value ?: "any"}" },
        )
    }
    NestedScreen(title = stringResource(R.string.builder_topics), onBack = actions.onCloseTopics, modifier = modifier) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                if (Gp.isWide) {
                    TrainingSplit(PaddingValues(), "topics", topicList, difficulty)
                } else {
                    Column(
                        Modifier
                            .widthIn(max = GpLayout.contentMax + GpLayout.gutter * 2)
                            .fillMaxWidth()
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = GpLayout.gutter, vertical = GpSpace.s8)
                            .testTag("topics"),
                        verticalArrangement = Arrangement.spacedBy(GpSpace.s16),
                    ) {
                        topicList()
                        difficulty()
                    }
                }
            }
            BottomActions(note = { KeyHint("Enter", stringResource(R.string.summary_done)) }) {
                GpPrimaryButton(
                    text = stringResource(R.string.topics_done, pluralStringResource(R.plurals.tasks_count, available, available)),
                    onClick = actions.onCloseTopics,
                    enabled = available > 0,
                    modifier = Modifier.fillMaxWidth().testTag("topics.done"),
                )
            }
        }
    }
}

private val DIFFICULTIES: List<Difficulty?> = listOf(null, Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD)
