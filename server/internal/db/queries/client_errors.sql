-- name: InsertClientError :exec
INSERT INTO client_errors (user_id, request_id, message, stack, route, client_kind, app_version, occurred_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- Старше 90 дней ошибки клиентов не нужны: таблица не растёт без конца.
-- name: DeleteOldClientErrors :execrows
DELETE FROM client_errors WHERE received_at < now() - interval '90 days';
