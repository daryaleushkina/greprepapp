-- name: ListExamSections :many
SELECT exam_id, section FROM exam_sections ORDER BY exam_id, position;

-- name: SetActiveExam :exec
UPDATE users SET active_exam = sqlc.arg(exam_id)::text WHERE id = sqlc.arg(user_id);
