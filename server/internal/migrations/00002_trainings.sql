-- Тренировки: темы, задания с разборами, сессии с ответами, жалобы на задания (ROADMAP §5.1, первый срез —
-- задания с выбором ответа). Контент живёт здесь, а не в git: репозиторий публичный, ночная копия — в
-- приватном (решение Даши 05.10.2026).

-- +goose Up
CREATE TABLE topics (
  id       text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  section  text NOT NULL CHECK (section IN ('verbal', 'quant')),
  title_ru text NOT NULL CHECK (length(title_ru) BETWEEN 1 AND 200),
  title_en text NOT NULL CHECK (length(title_en) BETWEEN 1 AND 200),
  -- Порядок в списке тем конструктора (макет R2).
  position integer NOT NULL DEFAULT 0
);

-- Задание. В тренировки попадает только approved: до проверки Даши в веб-админке контент людям не виден
-- (AGENTS.md, «Контент заданий»). Удалять задание нельзя — на него ссылаются ответы; убирают статусом retired.
-- Раздел берётся у темы; что тип подходит к разделу и тело собрано верно, проверяет сервер при записи
-- (internal/training.Validate).
CREATE TABLE questions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_type text        NOT NULL CHECK (question_type IN ('text_completion', 'sentence_equivalence', 'quantitative_comparison', 'multiple_choice')),
  topic_id      text        NOT NULL REFERENCES topics (id),
  difficulty    text        NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  status        text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  -- Условие: prompt, condition, quantityA, quantityB, groups, selectCount — как Question в api/openapi.yaml.
  body          jsonb       NOT NULL,
  answer        text[]      NOT NULL CHECK (cardinality(answer) BETWEEN 1 AND 3),
  -- Разбор: solution и options — как Explanation в api/openapi.yaml.
  explanation   jsonb       NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX questions_approved_idx ON questions (question_type, topic_id) WHERE status = 'approved';

CREATE TABLE trainings (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  mode               text        NOT NULL CHECK (mode IN ('practice', 'check')),
  section            text        NOT NULL CHECK (section IN ('verbal', 'quant')),
  question_types     text[]      NOT NULL CHECK (cardinality(question_types) BETWEEN 1 AND 4),
  -- Запрос конструктора как есть — для «Как в прошлый раз».
  request            jsonb       NOT NULL,
  -- Только у «Проверки»: темп секции экзамена на число вопросов.
  time_limit_seconds integer     CHECK (time_limit_seconds > 0),
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  timed_out          boolean     NOT NULL DEFAULT false
);
CREATE INDEX trainings_user_started_idx ON trainings (user_id, started_at DESC);

-- Вопрос сессии и ответ на него. Ответа нет — answered_at пустой. correct ставит сервер по ключу.
CREATE TABLE training_items (
  training_id uuid        NOT NULL REFERENCES trainings (id) ON DELETE CASCADE,
  position    smallint    NOT NULL CHECK (position BETWEEN 0 AND 49),
  question_id uuid        NOT NULL REFERENCES questions (id),
  option_ids  text[]      NOT NULL DEFAULT '{}' CHECK (cardinality(option_ids) <= 3),
  dont_know   boolean     NOT NULL DEFAULT false,
  flagged     boolean     NOT NULL DEFAULT false,
  answered_at timestamptz,
  elapsed_ms  integer     CHECK (elapsed_ms BETWEEN 0 AND 86400000),
  correct     boolean,
  PRIMARY KEY (training_id, position),
  UNIQUE (training_id, question_id)
);
-- «Сначала нерешённые»: при подборе заданий ищем, видел ли человек задание.
CREATE INDEX training_items_question_idx ON training_items (question_id);

-- «Сообщить об ошибке» (макет R17) — в очередь админки.
CREATE TABLE question_reports (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid        REFERENCES users (id) ON DELETE SET NULL,
  question_id uuid        NOT NULL REFERENCES questions (id),
  training_id uuid        REFERENCES trainings (id) ON DELETE SET NULL,
  kind        text        NOT NULL CHECK (kind IN ('question', 'answer', 'explanation', 'translation', 'other')),
  text        text        CHECK (length(text) <= 2000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX question_reports_open_idx ON question_reports (created_at) WHERE resolved_at IS NULL;

-- +goose Down
DROP TABLE question_reports;
DROP TABLE training_items;
DROP TABLE trainings;
DROP TABLE questions;
DROP TABLE topics;
