-- Аккаунты, способы входа, сессии, ошибки клиентов — то, на чём стоит вход на всех платформах.
-- Миграции только вперёд и совместимые со старым кодом: вливание в main выкладывает бэкенд, а миграция
-- уходит в бой до него (CLAUDE.md, «Миграции базы»). Down — только для локальной отладки.

-- +goose Up
CREATE TABLE users (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL CHECK (length(name) BETWEEN 1 AND 128),
  role       text        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  locale     text        NOT NULL DEFAULT 'ru' CHECK (locale IN ('ru', 'en')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Способ входа: один человек — один аккаунт, к нему привязываются Telegram, Apple, Google
-- (PRODUCT.md, «Stack»: привязка только в настройках, без склеивания по почте). dev — вход подменой,
-- в бою его не бывает: сервер не принимает DEV_AUTH вместе с APP_ENV=production.
CREATE TABLE identities (
  provider   text        NOT NULL CHECK (provider IN ('telegram', 'apple', 'google', 'dev')),
  subject    text        NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject),
  -- Один способ каждого вида на аккаунт.
  UNIQUE (user_id, provider)
);

-- Сессия: в базе только SHA-256 токена — утечка базы не даёт войти (OWASP, RFC 6819).
CREATE TABLE sessions (
  token_hash          bytea       PRIMARY KEY CHECK (length(token_hash) = 32),
  user_id             uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client_kind         text        NOT NULL CHECK (client_kind IN ('web', 'telegram', 'ios', 'macos', 'android', 'admin')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  idle_expires_at     timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_absolute_expires_at_idx ON sessions (absolute_expires_at);

CREATE TABLE client_errors (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid        REFERENCES users (id) ON DELETE SET NULL,
  request_id  text,
  message     text        NOT NULL,
  stack       text,
  route       text,
  client_kind text        NOT NULL,
  app_version text        NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_errors_received_at_idx ON client_errors (received_at);

-- +goose Down
DROP TABLE client_errors;
DROP TABLE sessions;
DROP TABLE identities;
DROP TABLE users;
