package dev.greprepapp.app.feature.training

import dev.greprepapp.api.ApiFailure
import dev.greprepapp.api.ApiResult
import dev.greprepapp.api.apiCall
import dev.greprepapp.api.apiCallNoContent
import dev.greprepapp.api.apis.TrainingsApi
import dev.greprepapp.api.models.AnswerBatch
import dev.greprepapp.api.models.GivenAnswer
import dev.greprepapp.api.models.QuestionReport
import dev.greprepapp.api.models.QuestionType
import dev.greprepapp.api.models.TrainingFinish
import dev.greprepapp.api.models.TrainingOptions
import dev.greprepapp.api.models.TrainingRequest
import dev.greprepapp.app.core.AppForeground
import dev.greprepapp.app.core.AppScope
import dev.greprepapp.app.core.IoDispatcher
import dev.greprepapp.app.core.NetworkStatus
import dev.greprepapp.app.core.report.ClientErrorReporter
import dev.greprepapp.app.core.session.SessionManager
import dev.greprepapp.app.core.session.SessionState
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.IOException
import java.time.Clock
import javax.inject.Inject
import javax.inject.Singleton

/** Почему не получилось: нет сети — одно, наш сбой — другое (тексты разные). */
enum class TrainingProblem { Offline, Failed }

sealed interface StartResult {
    data class Started(
        val trainingId: String,
    ) : StartResult

    /** Под выбор нет ни одного проверенного задания. */
    data object NoQuestions : StartResult

    data class Failed(
        val problem: TrainingProblem,
    ) : StartResult
}

/**
 * Тренировки: начать (нужна сеть — сессия скачивается целиком), отвечать и закончить (без сети тоже), отправить
 * накопленное. Очередь отправки: сначала ответы каждой тренировки, потом её конец, потом жалобы; отправляется
 * сразу после действия, при появлении сети, при возврате в приложение и после входа.
 *
 * Всё, что пишется на устройство, пишется только для того входа, при котором началось (writeIfCurrent): выход
 * стирает тренировки, и поздний ответ сервера не возвращает их на диск.
 */
@Singleton
class TrainingRepository
    @Inject
    constructor(
        private val api: TrainingsApi,
        private val store: TrainingStore,
        private val session: SessionManager,
        private val reporter: ClientErrorReporter,
        private val clock: Clock,
        network: NetworkStatus,
        foreground: AppForeground,
        @param:AppScope private val scope: CoroutineScope,
        @param:IoDispatcher private val io: CoroutineDispatcher,
    ) {
        private val edits = Mutex()
        private val syncing = Mutex()

        @Volatile private var syncAgain = false

        val trainings: StateFlow<Map<String, StoredTraining>> = store.trainings

        /** Незаконченная тренировка для «Продолжить» на «Сегодня» — самая свежая. */
        val active: Flow<StoredTraining?> =
            store.trainings
                .map { all -> all.values.filterNot { it.isFinished }.maxByOrNull { it.startedAtMillis } }
                .distinctUntilChanged()

        init {
            scope.launch(io) { load() }
            scope.launch { network.isOnline.filter { it }.collect { requestSync() } }
            scope.launch { foreground.events.collect { requestSync() } }
            scope.launch { session.state.filter { it is SessionState.SignedIn }.collect { requestSync() } }
        }

        private fun load() {
            try {
                store.load()
            } catch (failure: IOException) {
                reporter.report("trainings load failed: ${failure.javaClass.simpleName}", route = ROUTE)
            }
        }

        /** Тренировка с устройства; первое значение — после чтения с диска, так что null — её правда нет. */
        fun training(id: String): Flow<StoredTraining?> =
            flow {
                withContext(io) { load() }
                emitAll(store.trainings.map { it[id] }.distinctUntilChanged())
            }

        private fun currentSession(): Long? = (session.state.value as? SessionState.SignedIn)?.id

        suspend fun options(): ApiResult<TrainingOptions> {
            val id = currentSession()
            val result = apiCall { api.getTrainingOptions(SUPPORTED) }
            if (result is ApiResult.Failed && id != null) handle(result.failure, id, "options")
            return result
        }

        /** Начать: сессия со всеми заданиями и разборами ложится на устройство целиком. */
        suspend fun start(request: TrainingRequest): StartResult {
            val id = currentSession() ?: return StartResult.Failed(TrainingProblem.Failed)
            return when (val result = apiCall { api.startTraining(request) }) {
                is ApiResult.Ok -> {
                    val stored = StoredTraining(session = result.value, startedAtMillis = clock.millis())
                    val saved =
                        edits.withLock {
                            write(id) {
                                store.put(stored)
                                prune()
                            }
                        }
                    if (saved) StartResult.Started(stored.id) else StartResult.Failed(TrainingProblem.Failed)
                }

                is ApiResult.Failed -> {
                    val failure = result.failure
                    if (failure is ApiFailure.Server && failure.code == NO_QUESTIONS) {
                        StartResult.NoQuestions
                    } else {
                        handle(failure, id, "start")
                        StartResult.Failed(if (failure == ApiFailure.Offline) TrainingProblem.Offline else TrainingProblem.Failed)
                    }
                }
            }
        }

        /** Ответ на позицию: ложится на устройство и встаёт в очередь отправки. */
        suspend fun answer(
            trainingId: String,
            position: Int,
            optionIds: List<String>,
            dontKnow: Boolean = false,
            flagged: Boolean = false,
            elapsedMs: Int = 0,
        ) {
            val given =
                GivenAnswer(
                    position = position,
                    optionIds = optionIds,
                    dontKnow = dontKnow,
                    flagged = flagged,
                    answeredAt = clock.instant().toString(),
                    elapsedMs = elapsedMs.coerceIn(0, MAX_ELAPSED_MS),
                )
            edit(trainingId) { t ->
                if (t.isFinished || position !in 0 until t.total) {
                    t
                } else {
                    t.copy(answers = t.answers + (position to given), unsent = t.unsent + position)
                }
            }
            requestSync()
        }

        /** Где человек остановился — чтобы «Продолжить» открыло тот же вопрос. */
        suspend fun moveTo(
            trainingId: String,
            position: Int,
        ) {
            edit(trainingId) { t -> if (position in 0 until t.total) t.copy(position = position) else t }
        }

        suspend fun finish(
            trainingId: String,
            timedOut: Boolean,
        ) {
            val finish = TrainingFinish(finishedAt = clock.instant().toString(), timedOut = timedOut)
            edit(trainingId) { t -> if (t.isFinished) t else t.copy(finish = finish) }
            requestSync()
        }

        /** «Сообщить об ошибке»: без сети жалоба ждёт в очереди. */
        suspend fun report(
            questionId: String,
            report: QuestionReport,
        ) {
            val id = currentSession() ?: return
            edits.withLock {
                write(id) { store.putReports(store.reports.value + PendingReport(questionId, report)) }
            }
            requestSync()
        }

        private suspend fun edit(
            trainingId: String,
            change: (StoredTraining) -> StoredTraining,
        ) {
            val id = currentSession() ?: return
            edits.withLock {
                val current = withContext(io) { store.get(trainingId) } ?: return
                val next = change(current)
                if (next != current) write(id) { store.put(next) }
            }
        }

        /** Запись для входа id; не записалось на диск — в отчёт (в памяти изменение уже есть). */
        private suspend fun write(
            id: Long,
            block: () -> Unit,
        ): Boolean =
            try {
                session.writeIfCurrent(id, block)
            } catch (failure: IOException) {
                // Только класс: в тексте ошибки — путь к файлу.
                reporter.report("training write failed: ${failure.javaClass.simpleName}", route = ROUTE)
                true
            }

        /** Старые законченные и отправленные тренировки — прочь; последние несколько остаются для разбора. */
        private fun prune() {
            store.trainings.value.values
                .filter { it.isFinished && it.isSynced }
                .sortedByDescending { it.startedAtMillis }
                .drop(KEEP_FINISHED)
                .forEach { store.remove(it.id) }
        }

        fun requestSync() {
            scope.launch(io) { sync() }
        }

        /**
         * Отправить всё накопленное. Одновременно идёт одна отправка; просьба во время неё — ещё один круг после.
         * Нет сети или сервер не в себе — круг обрывается и повторится по следующему поводу.
         */
        suspend fun sync() {
            if (!syncing.tryLock()) {
                syncAgain = true
                return
            }
            try {
                do {
                    syncAgain = false
                    syncOnce()
                } while (syncAgain)
            } finally {
                syncing.unlock()
            }
        }

        private suspend fun syncOnce() {
            val id = currentSession() ?: return
            withContext(io) { load() }
            for (t in store.trainings.value.values
                .sortedBy { it.startedAtMillis }) {
                if (!sendAnswers(t, id)) return
                val fresh = store.trainings.value[t.id] ?: continue
                if (fresh.finish != null && !fresh.finishSent && fresh.unsent.isEmpty() && !sendFinish(fresh, id)) return
            }
            sendReports(id)
        }

        /** false — круг прервать. */
        private suspend fun sendAnswers(
            t: StoredTraining,
            id: Long,
        ): Boolean {
            if (t.unsent.isEmpty()) return true
            val sent = t.unsent.sorted().mapNotNull { t.answers[it] }
            val result = apiCallNoContent { api.submitTrainingAnswers(t.id, AnswerBatch(sent)) }
            if (!session.isCurrent(id)) return false
            return settle(result, id, "answers") {
                // Убрать из очереди только то, что не поменялось, пока ответ летел: новый ответ «Проверки» уйдёт следом.
                edit(t.id) { cur -> cur.copy(unsent = cur.unsent.filterNot { cur.answers[it] in sent }.toSet()) }
            }
        }

        private suspend fun sendFinish(
            t: StoredTraining,
            id: Long,
        ): Boolean {
            val finish = t.finish ?: return true
            val result = apiCall { api.finishTraining(t.id, finish) }
            if (!session.isCurrent(id)) return false
            return settle(result, id, "finish") { edit(t.id) { it.copy(finishSent = true) } }
        }

        private suspend fun sendReports(id: Long) {
            for (pending in store.reports.value) {
                val result = apiCallNoContent { api.reportQuestion(pending.questionId, pending.report) }
                if (!session.isCurrent(id)) return
                val keepGoing =
                    settle(result, id, "report") {
                        edits.withLock { write(id) { store.putReports(store.reports.value - pending) } }
                    }
                if (!keepGoing) return
            }
        }

        /**
         * Итог отправки. Успех — done. Отказ 4xx — наш баг (клиент и сервер разошлись): в отчёт и тоже done, иначе
         * очередь застрянет навсегда. Нет сети, конец входа, 5xx — круг прервать, отправится потом.
         */
        private suspend fun <T> settle(
            result: ApiResult<T>,
            id: Long,
            what: String,
            done: suspend () -> Unit,
        ): Boolean =
            when (result) {
                is ApiResult.Ok -> {
                    done()
                    true
                }

                is ApiResult.Failed -> {
                    val failure = result.failure
                    handle(failure, id, what)
                    if (failure is ApiFailure.Server && failure.status in CLIENT_ERRORS) {
                        reporter.report("training $what rejected: ${failure.code}", route = ROUTE, requestId = failure.requestId)
                        done()
                        true
                    } else {
                        false
                    }
                }
            }

        private fun handle(
            failure: ApiFailure,
            id: Long,
            what: String,
        ) {
            when {
                failure == ApiFailure.Unauthorized -> session.handleUnauthorized(id)
                failure.isReportable -> reporter.report("training $what: $failure", route = ROUTE, requestId = failure.requestIdOrNull)
            }
        }

        companion object {
            /** Типы, которые приложение умеет показывать: о других сервер не расскажет (договор, options). */
            val SUPPORTED: List<QuestionType> = QuestionType.entries
            private const val NO_QUESTIONS = "no_questions"
            private const val KEEP_FINISHED = 3
            private const val MAX_ELAPSED_MS = 86_400_000
            private val CLIENT_ERRORS = 400..499
            private const val ROUTE = "training"
        }
    }
