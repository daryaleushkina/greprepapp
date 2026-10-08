package dev.greprepapp.app.feature.training

import dev.greprepapp.api.models.GivenAnswer
import dev.greprepapp.api.models.Question
import dev.greprepapp.api.models.Section
import dev.greprepapp.api.models.TopicToReview
import dev.greprepapp.api.models.TrainingFinish
import dev.greprepapp.api.models.TrainingSession
import dev.greprepapp.api.models.TrainingSummary
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Общие ожидания читаются моделями договора; собственных ключей и расчётов ожидаемого итога здесь нет. */
class TrainingRulesConformanceTest {
    @Test
    fun answersConform() {
        // Ошибку ввода проверяет сервер: клиент не собирает такие ответы, а isCorrect не валидирует ввод.
        cases.answers.filterNot { it.badAnswer }.forEach { c ->
            assertEquals(c.name, c.correct, TrainingRules.isCorrect(c.question, c.answer.optionIds))
        }
    }

    @Test
    fun summariesConform() {
        cases.summaries.forEach { c ->
            val got = TrainingRules.result(stored(c.session, c.startedAtMillis, c.finish))
            assertEquals(
                c.name,
                c.expected,
                TrainingSummary(
                    correct = got.correct,
                    total = got.total,
                    unanswered = got.unanswered,
                    durationSeconds = got.durationSeconds,
                    review = got.review.map { topic -> TopicToReview(topic.topicId, topic.title, topic.mistakes, topic.positions) },
                ),
            )
        }
    }

    @Test
    fun togglesConform() {
        cases.toggles.forEach { c ->
            assertEquals(c.name, c.expected, TrainingRules.toggle(c.question, c.selection, c.optionId))
        }
    }

    @Test
    fun missingGroupsConform() {
        cases.missingGroups.forEach { c ->
            assertEquals(c.name, c.expected, TrainingRules.missingGroups(c.question, c.selection))
            assertEquals(c.name, c.complete, TrainingRules.isComplete(c.question, c.selection))
        }
    }

    @Test
    fun clocksConform() {
        cases.clocks.forEach { c ->
            val training = stored(c.session, c.startedAtMillis, c.finish)
            assertEquals("${c.name}: remainingSeconds", c.remainingSeconds, TrainingRules.remainingSeconds(training, c.nowMillis))
            assertEquals("${c.name}: durationSeconds", c.durationSeconds, TrainingRules.durationSeconds(training))
        }
    }

    @Test
    fun minutesConform() {
        cases.minutes.forEach { c ->
            assertEquals(c.name, c.minutes to c.limitMinutes, TrainingRules.summaryMinutes(c.durationSeconds, c.limitSeconds))
        }
    }

    @Test
    fun repeatsConform() {
        cases.repeats.forEach { c ->
            assertEquals(c.name, c.count, TrainingRules.repeatCount(c.mistakes))
        }
    }

    private fun stored(
        session: TrainingSession,
        startedAtMillis: Long,
        finish: TrainingFinish?,
    ) = StoredTraining(
        session = session,
        startedAtMillis = startedAtMillis,
        answers = session.items.mapNotNull { it.answer }.associateBy { it.position },
        finish = finish,
    )

    private companion object {
        val cases =
            TrainingRulesConformanceTest::class.java
                .getResourceAsStream("/training-rules.json")
                .let { stream ->
                    checkNotNull(stream) { "Missing api/conformance/training-rules.json test resource" }
                    stream.bufferedReader(Charsets.UTF_8).use { Json.decodeFromString<TrainingConformanceCases>(it.readText()) }
                }.also { c ->
                    assertTrue("answers must not be empty", c.answers.any { !it.badAnswer })
                    assertTrue("summaries must not be empty", c.summaries.isNotEmpty())
                    assertTrue("pace must not be empty", c.pace.isNotEmpty())
                    assertTrue("toggles must not be empty", c.toggles.isNotEmpty())
                    assertTrue("missingGroups must not be empty", c.missingGroups.isNotEmpty())
                    assertTrue("clocks must not be empty", c.clocks.isNotEmpty())
                    assertTrue("minutes must not be empty", c.minutes.isNotEmpty())
                    assertTrue("repeats must not be empty", c.repeats.isNotEmpty())
                }
    }
}

@Serializable
private data class TrainingConformanceCases(
    val answers: List<AnswerCase>,
    val summaries: List<SummaryCase>,
    // Темп вычисляет только сервер; Android получает его и лимит сессии готовыми по договору.
    val pace: List<PaceCase>,
    val toggles: List<ToggleCase>,
    val missingGroups: List<MissingGroupsCase>,
    val clocks: List<ClockCase>,
    val minutes: List<MinutesCase>,
    val repeats: List<RepeatCase>,
)

@Serializable
private data class AnswerCase(
    val name: String,
    val question: Question,
    val answer: GivenAnswer,
    val correct: Boolean,
    val badAnswer: Boolean,
)

@Serializable
private data class SummaryCase(
    val name: String,
    val startedAtMillis: Long,
    val session: TrainingSession,
    val finish: TrainingFinish,
    val expected: TrainingSummary,
)

@Serializable
private data class PaceCase(
    val name: String,
    val section: Section,
    val count: Int,
    val paceSeconds: Int,
    val timeLimitSeconds: Int,
)

@Serializable
private data class ToggleCase(
    val name: String,
    val question: Question,
    val selection: List<String>,
    val optionId: String,
    val expected: List<String>,
)

@Serializable
private data class MissingGroupsCase(
    val name: String,
    val question: Question,
    val selection: List<String>,
    val expected: List<Int>,
    val complete: Boolean,
)

@Serializable
private data class ClockCase(
    val name: String,
    val startedAtMillis: Long,
    val nowMillis: Long,
    val session: TrainingSession,
    val finish: TrainingFinish? = null,
    val remainingSeconds: Int? = null,
    val durationSeconds: Int,
)

@Serializable
private data class MinutesCase(
    val name: String,
    val durationSeconds: Int,
    val limitSeconds: Int? = null,
    val minutes: Int,
    val limitMinutes: Int? = null,
)

@Serializable
private data class RepeatCase(
    val name: String,
    val mistakes: Int,
    val count: Int,
)
