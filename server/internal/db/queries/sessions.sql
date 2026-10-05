-- name: CreateSession :exec
INSERT INTO sessions (token_hash, user_id, client_kind, idle_expires_at, absolute_expires_at)
VALUES ($1, $2, $3, $4, $5);

-- Сессия жива, только если не истекли оба срока: простоя и абсолютный.
-- name: GetLiveSession :one
SELECT s.token_hash, s.last_seen_at, s.idle_expires_at, u.*
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.token_hash = $1
  AND s.idle_expires_at > now()
  AND s.absolute_expires_at > now();

-- Продление простоя — не дальше абсолютного срока.
-- name: TouchSession :exec
UPDATE sessions
SET last_seen_at = now(),
    idle_expires_at = least(@idle_expires_at::timestamptz, absolute_expires_at)
WHERE token_hash = @token_hash;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash = $1;

-- name: DeleteExpiredSessions :execrows
DELETE FROM sessions WHERE idle_expires_at <= now() OR absolute_expires_at <= now();
