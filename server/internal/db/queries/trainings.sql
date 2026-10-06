-- Сколько проверенных заданий в каждой теме по типу и сложности — для конструктора (макеты R1, R2).
-- name: CountApprovedQuestions :many
SELECT t.section, q.question_type, t.id AS topic_id, t.title_ru, t.title_en, q.difficulty, count(*)::integer AS available
FROM questions q
JOIN topics t ON t.id = q.topic_id
WHERE q.status = 'approved'
GROUP BY t.section, q.question_type, t.id, t.title_ru, t.title_en, t.position, q.difficulty
ORDER BY t.position, t.id;

-- name: GetLastTrainingRequest :one
SELECT request FROM trainings WHERE user_id = $1 ORDER BY started_at DESC LIMIT 1;

-- Подбор заданий: только проверенные, сначала те, что человек ещё не видел, внутри — случайно.
-- name: PickQuestions :many
SELECT q.id
FROM questions q
JOIN topics t ON t.id = q.topic_id
WHERE q.status = 'approved'
  AND t.section = sqlc.arg(section)
  AND q.question_type = ANY (sqlc.arg(question_types)::text[])
  AND (cardinality(sqlc.arg(topic_ids)::text[]) = 0 OR q.topic_id = ANY (sqlc.arg(topic_ids)::text[]))
  AND (sqlc.narg(difficulty)::text IS NULL OR q.difficulty = sqlc.narg(difficulty)::text)
ORDER BY EXISTS (
    SELECT 1 FROM training_items i
    JOIN trainings tr ON tr.id = i.training_id
    WHERE tr.user_id = sqlc.arg(user_id) AND i.question_id = q.id
  ), random()
LIMIT sqlc.arg(max_count)::integer;

-- name: CreateTraining :one
INSERT INTO trainings (user_id, mode, section, question_types, request, time_limit_seconds, started_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: CreateTrainingItems :exec
INSERT INTO training_items (training_id, position, question_id)
SELECT sqlc.arg(training_id), (p.ord - 1)::smallint, p.question_id
FROM unnest(sqlc.arg(question_ids)::uuid[]) WITH ORDINALITY AS p (question_id, ord);

-- Своя тренировка; чужая не находится, как и несуществующая.
-- name: GetTraining :one
SELECT * FROM trainings WHERE id = $1 AND user_id = $2;

-- Та же, но под блокировкой: ответы и завершение одной тренировки идут по очереди.
-- name: LockTraining :one
SELECT * FROM trainings WHERE id = $1 AND user_id = $2 FOR UPDATE;

-- name: ListTrainingItems :many
SELECT i.position, i.question_id, i.option_ids, i.dont_know, i.flagged, i.answered_at, i.elapsed_ms, i.correct,
       q.question_type, q.difficulty, q.body, q.answer, q.explanation,
       t.id AS topic_id, t.section, t.title_ru, t.title_en
FROM training_items i
JOIN questions q ON q.id = i.question_id
JOIN topics t ON t.id = q.topic_id
WHERE i.training_id = $1
ORDER BY i.position;

-- Ответ на позицию. keep_first — «Практика»: разбор уже показан, первый ответ не заменяется. Иначе
-- остаётся самый поздний по answered_at: очередь без сети может прийти не по порядку.
-- name: SaveTrainingAnswer :execrows
UPDATE training_items
SET option_ids = sqlc.arg(option_ids),
    dont_know = sqlc.arg(dont_know),
    flagged = sqlc.arg(flagged),
    answered_at = sqlc.arg(answered_at),
    elapsed_ms = sqlc.arg(elapsed_ms),
    correct = sqlc.arg(correct)
WHERE training_id = sqlc.arg(training_id)
  AND position = sqlc.arg(position)
  AND (answered_at IS NULL OR (NOT sqlc.arg(keep_first)::boolean AND answered_at <= sqlc.arg(answered_at)));

-- name: FinishTraining :exec
UPDATE trainings SET finished_at = $2, timed_out = $3 WHERE id = $1 AND finished_at IS NULL;

-- Жаловаться можно на проверенное задание или на то, что было в своей тренировке (его могли снять потом).
-- name: QuestionReportable :one
SELECT EXISTS (
  SELECT 1 FROM questions q
  WHERE q.id = sqlc.arg(question_id)
    AND (q.status = 'approved' OR EXISTS (
      SELECT 1 FROM training_items i
      JOIN trainings tr ON tr.id = i.training_id
      WHERE i.question_id = q.id AND tr.user_id = sqlc.arg(user_id)
    ))
);

-- name: InsertQuestionReport :exec
INSERT INTO question_reports (user_id, question_id, training_id, kind, text) VALUES ($1, $2, $3, $4, $5);

-- Набор для разработки (greprep seed-dev) и тестов; в бой контент приходит через админку.
-- name: UpsertTopic :exec
INSERT INTO topics (id, section, title_ru, title_en, position) VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (id) DO UPDATE SET section = excluded.section, title_ru = excluded.title_ru,
  title_en = excluded.title_en, position = excluded.position;

-- name: UpsertQuestion :exec
INSERT INTO questions (id, question_type, topic_id, difficulty, status, body, answer, explanation)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (id) DO UPDATE SET question_type = excluded.question_type, topic_id = excluded.topic_id,
  difficulty = excluded.difficulty, status = excluded.status, body = excluded.body, answer = excluded.answer,
  explanation = excluded.explanation, updated_at = now();

-- name: GetTopicSection :one
SELECT section FROM topics WHERE id = $1;
