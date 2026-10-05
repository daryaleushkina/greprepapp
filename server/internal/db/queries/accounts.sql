-- name: GetUser :one
SELECT * FROM users WHERE id = $1;

-- name: CreateUser :one
INSERT INTO users (name, role, locale) VALUES ($1, $2, $3) RETURNING *;

-- name: GetUserByIdentity :one
SELECT u.*
FROM identities i
JOIN users u ON u.id = i.user_id
WHERE i.provider = $1 AND i.subject = $2;

-- name: CreateIdentity :exec
INSERT INTO identities (provider, subject, user_id) VALUES ($1, $2, $3);

-- name: ListIdentities :many
SELECT provider, created_at FROM identities
WHERE user_id = $1 AND provider <> 'dev'
ORDER BY created_at;

-- name: SetUserRole :exec
UPDATE users SET role = $2 WHERE id = $1;
