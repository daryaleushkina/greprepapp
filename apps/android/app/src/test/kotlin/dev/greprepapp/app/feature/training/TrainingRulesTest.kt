package dev.greprepapp.app.feature.training

import dev.greprepapp.api.models.GivenAnswer
import dev.greprepapp.api.models.TrainingFinish
import dev.greprepapp.api.models.TrainingMode
import dev.greprepapp.app.testing.Fixtures
import dev.greprepapp.app.testing.Fixtures.mc
import dev.greprepapp.app.testing.Fixtures.qc
import dev.greprepapp.app.testing.Fixtures.se
import dev.greprepapp.app.testing.Fixtures.tc1
import dev.greprepapp.app.testing.Fixtures.tc3
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Правила тренировки на устройстве — те же, что у сервера (server/internal/training). */
class TrainingRulesTest {
    private fun answer(
        position: Int,
        vararg ids: String,
        dontKnow: Boolean = false,
    ) = GivenAnswer(position, ids.toList(), dontKnow, flagged = false, answeredAt = "2026-10-06T09:01:00Z", elapsedMs = 1000)

    private fun training(
        vararg answers: GivenAnswer,
        mode: TrainingMode = TrainingMode.PRACTICE,
        finish: TrainingFinish? = null,
    ) = StoredTraining(
        session = Fixtures.session(tc1, tc3, se, qc, mc, mode = mode),
        startedAtMillis = START,
        answers = answers.associateBy { it.position },
        finish = finish,
    )

    @Test
    fun onlyTheFullAnswerIsCorrect() {
        assertTrue(TrainingRules.isCorrect(tc1, listOf("A")))
        assertFalse(TrainingRules.isCorrect(tc1, listOf("B")))
        assertTrue("порядок не важен", TrainingRules.isCorrect(tc3, listOf("G", "A", "D")))
        assertFalse("два пропуска из трёх — неверно", TrainingRules.isCorrect(tc3, listOf("A", "D", "H")))
        assertTrue(TrainingRules.isCorrect(se, listOf("C", "A")))
        assertFalse("одно слово из двух — неверно", TrainingRules.isCorrect(se, listOf("A")))
        assertFalse(TrainingRules.isCorrect(se, listOf("A", "B")))
    }

    @Test
    fun checkWaitsForEveryBlank() {
        assertEquals(listOf(0), TrainingRules.missingGroups(tc1, emptyList()))
        assertEquals(listOf(1, 2), TrainingRules.missingGroups(tc3, listOf("B")))
        assertTrue(TrainingRules.isComplete(tc3, listOf("B", "E", "I")))
        assertFalse("второе слово не выбрано", TrainingRules.isComplete(se, listOf("A")))
        assertTrue(TrainingRules.isComplete(se, listOf("A", "B")))
    }

    @Test
    fun tapReplacesWithinABlankAndEvictsTheEarliestOfTwo() {
        assertEquals(listOf("C"), TrainingRules.toggle(tc1, listOf("A"), "C"))
        assertEquals(listOf("D", "B"), TrainingRules.toggle(tc3, listOf("A", "D"), "B"))
        assertEquals(listOf("A", "C"), TrainingRules.toggle(se, listOf("A"), "C"))
        assertEquals(listOf("C"), TrainingRules.toggle(se, listOf("A", "C"), "A"))
        assertEquals("третий выбор вытесняет первый", listOf("C", "E"), TrainingRules.toggle(se, listOf("A", "C"), "E"))
        assertEquals("чужой вариант ничего не меняет", listOf("A"), TrainingRules.toggle(tc1, listOf("A"), "Z"))
    }

    @Test
    fun timerRunsOnlyInCheckAndStopsAtZero() {
        assertNull(TrainingRules.remainingSeconds(training(), START + 60_000))
        val check = training(mode = TrainingMode.CHECK)
        assertEquals(5 * 90, TrainingRules.remainingSeconds(check, START))
        assertEquals(5 * 90 - 61, TrainingRules.remainingSeconds(check, START + 61_500))
        assertEquals(0, TrainingRules.remainingSeconds(check, START + 3_600_000))
    }

    @Test
    fun resultCountsMistakesByTopic() {
        val result =
            TrainingRules.result(
                training(
                    answer(0, "A"), // верно
                    answer(1, "B", "D", "G"), // неверно — cause-effect
                    answer(2, dontKnow = true), // «Не знаю» — ошибка, close-synonyms
                    // 3 (qc) пропущен — ошибка exponents-roots
                    answer(4, "A"), // неверно — percents
                    finish = TrainingFinish("2026-10-06T09:11:30Z", timedOut = false),
                ),
            )
        assertEquals(1, result.correct)
        assertEquals(5, result.total)
        assertEquals(2, result.unanswered)
        assertEquals(690, result.durationSeconds)
        assertEquals(
            "тем не больше трёх, по порядку встречи",
            listOf(
                "cause-effect",
                "close-synonyms",
                "exponents-roots",
            ),
            result.review.map {
                it.topicId
            },
        )
        assertEquals(listOf(1), result.review[0].positions)
    }

    @Test
    fun theTopicWithMoreMistakesComesFirst() {
        // Первая ошибка — в теме контраста (tc1), но в теме синонимов (se) их две.
        val t =
            StoredTraining(
                session = Fixtures.session(tc1, se, se),
                startedAtMillis = START,
                answers = listOf(answer(0, "B"), answer(1, "A", "B"), answer(2, "B", "D")).associateBy { it.position },
                finish = TrainingFinish("2026-10-06T09:05:00Z", timedOut = false),
            )
        assertEquals(listOf("close-synonyms", "contrast-signals"), TrainingRules.result(t).review.map { it.topicId })
    }

    @Test
    fun summaryMinutesNeverExceedTheLimit() {
        assertEquals(1 to null, TrainingRules.summaryMinutes(20, null))
        assertEquals(11 to null, TrainingRules.summaryMinutes(680, null))
        // Лимит 105 с — «2 минуты из 2», а не «2 из 1»; 450 с — «8 из 8», а не «8 из 7».
        assertEquals(2 to 2, TrainingRules.summaryMinutes(105, 105))
        assertEquals(8 to 8, TrainingRules.summaryMinutes(450, 450))
        assertEquals(3 to 8, TrainingRules.summaryMinutes(170, 450))
    }

    @Test
    fun afterTimeOutUnansweredAreNotTopicMistakes() {
        val result =
            TrainingRules.result(
                training(
                    answer(0, "A"),
                    answer(1, dontKnow = true),
                    mode = TrainingMode.CHECK,
                    finish = TrainingFinish("2026-10-06T10:00:00Z", timedOut = true),
                ),
            )
        assertEquals(4, result.unanswered)
        assertEquals("«Не знаю» остаётся ошибкой, «не успел» — нет", listOf("cause-effect"), result.review.map { it.topicId })
        assertEquals("у «Проверки» — не дольше её времени", 5 * 90, result.durationSeconds)
    }

    @Test
    fun durationIsZeroWhenTheEndIsUnreadable() {
        assertEquals(0, TrainingRules.durationSeconds(training()))
        assertEquals(0, TrainingRules.durationSeconds(training(finish = TrainingFinish("not a date", timedOut = false))))
        assertEquals(
            "часы устройства ушли назад",
            0,
            TrainingRules.durationSeconds(training(finish = TrainingFinish("2026-10-06T08:00:00Z", false))),
        )
    }

    @Test
    fun repeatIsTwoPerMistakeWithinFiveToTen() {
        assertEquals(5, TrainingRules.repeatCount(1))
        assertEquals(8, TrainingRules.repeatCount(4))
        assertEquals(10, TrainingRules.repeatCount(9))
    }

    private companion object {
        val START =
            java.time.Instant
                .parse("2026-10-06T09:00:00Z")
                .toEpochMilli()
    }
}
