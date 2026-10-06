package dev.greprepapp.app.testing

import dev.greprepapp.api.apis.TrainingsApi
import dev.greprepapp.api.models.AnswerBatch
import dev.greprepapp.api.models.Difficulty
import dev.greprepapp.api.models.DifficultyCounts
import dev.greprepapp.api.models.Explanation
import dev.greprepapp.api.models.LocalizedText
import dev.greprepapp.api.models.OptionExplanation
import dev.greprepapp.api.models.OptionGroup
import dev.greprepapp.api.models.Question
import dev.greprepapp.api.models.QuestionOption
import dev.greprepapp.api.models.QuestionReport
import dev.greprepapp.api.models.QuestionType
import dev.greprepapp.api.models.Section
import dev.greprepapp.api.models.TrainingFinish
import dev.greprepapp.api.models.TrainingItem
import dev.greprepapp.api.models.TrainingMode
import dev.greprepapp.api.models.TrainingOptions
import dev.greprepapp.api.models.TrainingPreset
import dev.greprepapp.api.models.TrainingRequest
import dev.greprepapp.api.models.TrainingSession
import dev.greprepapp.api.models.TrainingSummary
import dev.greprepapp.api.models.TrainingTopic
import dev.greprepapp.api.models.TrainingType
import kotlinx.coroutines.CompletableDeferred
import retrofit2.Response

/** Задания для тестов — те же, что в наборе для разработки сервера (server/internal/devseed), в сокращении. */
object Fixtures {
    private fun text(
        ru: String,
        en: String = ru,
    ) = LocalizedText(ru = ru, en = en)

    private fun group(vararg options: Pair<String, String>) = OptionGroup(options.map { (id, t) -> QuestionOption(id, t) })

    private fun whyNot(vararg ids: String) =
        ids.map { OptionExplanation(optionId = it, text = text("*$it* — не подходит по смыслу.", "*$it* does not fit.")) }

    val contrast = text("Слова-сигналы контраста", "Contrast signal words")
    val cause = text("Причина и следствие", "Cause and effect")
    val synonyms = text("Близкие синонимы", "Close synonyms")
    val roots = text("Степени и корни", "Exponents and roots")
    val percents = text("Проценты и доли", "Percents and fractions")

    val tc1 =
        Question(
            id = "00000000-0000-4000-8000-000000000001",
            questionType = QuestionType.TEXT_COMPLETION,
            section = Section.VERBAL,
            topicId = "contrast-signals",
            topicTitle = contrast,
            difficulty = Difficulty.MEDIUM,
            prompt =
                "Although the committee’s report was praised for its thoroughness, critics noted that its conclusions " +
                    "were oddly ___, hedging on nearly every recommendation it made.",
            groups = listOf(group("A" to "equivocal", "B" to "incisive", "C" to "exhaustive", "D" to "dogmatic", "E" to "lucid")),
            selectCount = 1,
            answer = listOf("A"),
            explanation =
                Explanation(
                    solution =
                        text(
                            "Подсказка — *hedging on nearly every recommendation*: выводы уклончивы. Это и есть *equivocal*.",
                            "The clue is *hedging on nearly every recommendation*: that is what *equivocal* means.",
                        ),
                    options =
                        listOf(
                            OptionExplanation(
                                "C",
                                text(
                                    "*exhaustive* — «исчерпывающий». Соблазняет, потому что рядом стоит *thoroughness*.",
                                    "*exhaustive* is tempting because *thoroughness* appears nearby.",
                                ),
                            ),
                        ) + whyNot("B", "D", "E"),
                ),
        )

    val tc3 =
        Question(
            id = "00000000-0000-4000-8000-000000000002",
            questionType = QuestionType.TEXT_COMPLETION,
            section = Section.VERBAL,
            topicId = "cause-effect",
            topicTitle = cause,
            difficulty = Difficulty.HARD,
            prompt =
                "Far from being ___, the new biography is ___: the author cites letters, ledgers and diaries on nearly " +
                    "every page, so that even skeptical reviewers concede its ___.",
            groups =
                listOf(
                    group("A" to "speculative", "B" to "meticulous", "C" to "exhaustive"),
                    group("D" to "scrupulously documented", "E" to "hastily assembled", "F" to "deliberately vague"),
                    group("G" to "authority", "H" to "brevity", "I" to "whimsy"),
                ),
            selectCount = 1,
            answer = listOf("A", "D", "G"),
            explanation =
                Explanation(
                    solution = text("Источники на каждой странице — книга документирована.", "Sources on every page: documented."),
                    options = whyNot("B", "C", "E", "F", "H", "I"),
                ),
        )

    val se =
        Question(
            id = "00000000-0000-4000-8000-000000000003",
            questionType = QuestionType.SENTENCE_EQUIVALENCE,
            section = Section.VERBAL,
            topicId = "close-synonyms",
            topicTitle = synonyms,
            difficulty = Difficulty.MEDIUM,
            prompt = "Although she had a reputation for being ___, the diplomat proved surprisingly flexible in the final round.",
            groups =
                listOf(
                    group(
                        "A" to "intransigent",
                        "B" to "affable",
                        "C" to "obdurate",
                        "D" to "loquacious",
                        "E" to "pliant",
                        "F" to "candid",
                    ),
                ),
            selectCount = 2,
            answer = listOf("A", "C"),
            explanation =
                Explanation(
                    solution = text("Оба слова значат «несговорчивый» — контраст с *flexible*.", "Both mean unyielding."),
                    options = whyNot("B", "D", "E", "F"),
                ),
        )

    val qc =
        Question(
            id = "00000000-0000-4000-8000-000000000004",
            questionType = QuestionType.QUANTITATIVE_COMPARISON,
            section = Section.QUANT,
            topicId = "exponents-roots",
            topicTitle = roots,
            difficulty = Difficulty.MEDIUM,
            prompt = "Compare Quantity A and Quantity B.",
            condition = "0 < x < 1",
            quantityA = "x²",
            quantityB = "√x",
            groups =
                listOf(
                    group(
                        "A" to "Quantity A is greater.",
                        "B" to "Quantity B is greater.",
                        "C" to "The two quantities are equal.",
                        "D" to "The relationship cannot be determined from the information given.",
                    ),
                ),
            selectCount = 1,
            answer = listOf("B"),
            explanation =
                Explanation(
                    solution = text("Для 0 < x < 1: x² < x < √x.", "For 0 < x < 1: x² < x < √x."),
                    options = whyNot("A", "C", "D"),
                ),
        )

    val mc =
        Question(
            id = "00000000-0000-4000-8000-000000000005",
            questionType = QuestionType.MULTIPLE_CHOICE,
            section = Section.QUANT,
            topicId = "percents",
            topicTitle = percents,
            difficulty = Difficulty.EASY,
            prompt = "A shirt costs \$40. During a sale, its price is reduced by 15%. What is the sale price?",
            groups = listOf(group("A" to "\$25", "B" to "\$34", "C" to "\$35", "D" to "\$36", "E" to "\$46")),
            selectCount = 1,
            answer = listOf("B"),
            explanation =
                Explanation(
                    solution = text("15% от 40 — это 6. 40 − 6 = 34.", "15% of 40 is 6, and 40 − 6 = 34."),
                    options = whyNot("A", "C", "D", "E"),
                ),
        )

    fun session(
        vararg questions: Question,
        id: String = "11111111-0000-4000-8000-000000000001",
        mode: TrainingMode = TrainingMode.PRACTICE,
        timeLimitSeconds: Int? = null,
    ): TrainingSession =
        TrainingSession(
            id = id,
            mode = mode,
            section = questions.first().section,
            questionTypes = questions.map { it.questionType }.distinct(),
            startedAt = "2026-10-06T09:00:00Z",
            items = questions.mapIndexed { i, q -> TrainingItem(position = i, question = q) },
            timeLimitSeconds = timeLimitSeconds ?: if (mode == TrainingMode.CHECK) questions.size * 90 else null,
        )

    private fun topic(
        id: String,
        title: LocalizedText,
        easy: Int = 0,
        medium: Int = 0,
        hard: Int = 0,
    ) = TrainingTopic(id = id, title = title, available = DifficultyCounts(easy = easy, medium = medium, hard = hard))

    fun options(presets: List<TrainingPreset> = emptyList()): TrainingOptions =
        TrainingOptions(
            types =
                listOf(
                    TrainingType(
                        Section.VERBAL,
                        QuestionType.TEXT_COMPLETION,
                        paceSeconds = 90,
                        topics =
                            listOf(
                                topic("contrast-signals", contrast, easy = 1, medium = 2),
                                topic("cause-effect", cause, medium = 2, hard = 3),
                            ),
                    ),
                    TrainingType(
                        Section.VERBAL,
                        QuestionType.SENTENCE_EQUIVALENCE,
                        paceSeconds = 90,
                        topics = listOf(topic("close-synonyms", synonyms, easy = 1, medium = 4)),
                    ),
                    TrainingType(
                        Section.QUANT,
                        QuestionType.QUANTITATIVE_COMPARISON,
                        paceSeconds = 105,
                        topics = listOf(topic("exponents-roots", roots, medium = 2)),
                    ),
                    TrainingType(Section.QUANT, QuestionType.MULTIPLE_CHOICE, paceSeconds = 105, topics = emptyList()),
                ),
            presets = presets,
            maxQuestions = 50,
        )

    val lastPreset =
        TrainingPreset(
            kind = "last",
            request =
                TrainingRequest(
                    section = Section.QUANT,
                    questionTypes = setOf(QuestionType.QUANTITATIVE_COMPARISON),
                    count = 5,
                    mode = TrainingMode.CHECK,
                ),
        )

    val timedPreset =
        TrainingPreset(
            kind = "timed",
            request =
                TrainingRequest(
                    section = Section.VERBAL,
                    questionTypes = setOf(QuestionType.TEXT_COMPLETION, QuestionType.SENTENCE_EQUIVALENCE),
                    count = 12,
                    mode = TrainingMode.CHECK,
                    topicIds = emptyList(),
                ),
        )
}

/** Подменный клиент тренировок: что пришло и что ответить. */
class FakeTrainingsApi : TrainingsApi {
    var options: Reply<TrainingOptions> = Reply.Ok(Fixtures.options())
    var start: Reply<TrainingSession> = Reply.Ok(Fixtures.session(Fixtures.tc1, Fixtures.se))
    var answers: Reply<Unit> = Reply.Ok(Unit)

    /** Свой ответ сервера для отдельной тренировки (одна «сломанная» среди целых). */
    val answersFor = mutableMapOf<String, Reply<Unit>>()
    var finish: Reply<TrainingSummary> = Reply.Ok(TrainingSummary(0, 1, 0, 0, emptyList()))
    var report: Reply<Unit> = Reply.Ok(Unit)

    /** Задержать отправку ответов, пока тест не отпустит (ответ «в пути»). */
    var answersGate: CompletableDeferred<Unit>? = null

    val optionCalls = mutableListOf<List<QuestionType>>()
    val starts = mutableListOf<TrainingRequest>()
    val sentAnswers = mutableListOf<Pair<String, AnswerBatch>>()
    val finishes = mutableListOf<Pair<String, TrainingFinish>>()
    val reports = mutableListOf<Pair<String, QuestionReport>>()

    override suspend fun getTrainingOptions(types: List<QuestionType>): Response<TrainingOptions> {
        optionCalls += types
        return options.toResponse()
    }

    override suspend fun startTraining(trainingRequest: TrainingRequest): Response<TrainingSession> {
        starts += trainingRequest
        return start.toResponse()
    }

    override suspend fun getTraining(trainingId: String): Response<TrainingSession> = error("not used")

    override suspend fun submitTrainingAnswers(
        trainingId: String,
        answerBatch: AnswerBatch,
    ): Response<Unit> {
        answersGate?.await()
        sentAnswers += trainingId to answerBatch
        return (answersFor[trainingId] ?: answers).toResponseNoContent()
    }

    override suspend fun finishTraining(
        trainingId: String,
        trainingFinish: TrainingFinish,
    ): Response<TrainingSummary> {
        finishes += trainingId to trainingFinish
        return finish.toResponse()
    }

    override suspend fun reportQuestion(
        questionId: String,
        questionReport: QuestionReport,
    ): Response<Unit> {
        reports += questionId to questionReport
        return report.toResponseNoContent()
    }
}

/** 204 без тела — как отвечает сервер на ответы и жалобы. */
fun Reply<Unit>.toResponseNoContent(): Response<Unit> = if (this is Reply.Ok) Response.success(204, Unit) else toResponse()
