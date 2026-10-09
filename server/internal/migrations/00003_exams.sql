-- Экзамен у аккаунта и тренировок; контент получает экзамен через тему (решение Даши 09.10.2026).
-- GRE и TOEFL — строки справочника: следующий экзамен не требует новой схемы.
-- +goose Up
CREATE TABLE exams (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,63}$')
);
CREATE TABLE exam_sections (
  exam_id text NOT NULL REFERENCES exams (id),
  section text NOT NULL CHECK (section ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (exam_id, section),
  UNIQUE (exam_id, position)
);
INSERT INTO exams (id) VALUES ('gre'), ('toefl');
INSERT INTO exam_sections (exam_id, section, position) VALUES
  ('gre', 'verbal', 0), ('gre', 'quant', 1), ('gre', 'essay', 2),
  ('toefl', 'reading', 0), ('toefl', 'listening', 1), ('toefl', 'writing', 2), ('toefl', 'speaking', 3);

ALTER TABLE users ADD COLUMN active_exam text REFERENCES exams (id);
-- DEFAULT сохраняет совместимость со старым сервером между миграцией и выкладкой. Новый API требует
-- явного exam в запросе; аккаунт не используется как запасной источник экзамена.
ALTER TABLE topics ADD COLUMN exam_id text NOT NULL DEFAULT 'gre';
ALTER TABLE topics DROP CONSTRAINT topics_section_check;
ALTER TABLE topics ADD FOREIGN KEY (exam_id, section) REFERENCES exam_sections (exam_id, section);
ALTER TABLE trainings ADD COLUMN exam_id text NOT NULL DEFAULT 'gre';
ALTER TABLE trainings DROP CONSTRAINT trainings_section_check;
ALTER TABLE trainings ADD FOREIGN KEY (exam_id, section) REFERENCES exam_sections (exam_id, section);
UPDATE trainings SET request = request || '{"exam":"gre"}'::jsonb;
CREATE INDEX trainings_user_exam_started_idx ON trainings (user_id, exam_id, started_at DESC);
DROP INDEX trainings_user_started_idx;

-- +goose Down
-- Откат не переименовывает TOEFL в GRE и не удаляет ответы. Новые данные, которые старая схема не
-- представляет, блокируют откат целиком; goose выполняет миграцию в транзакции.
ALTER TABLE topics ADD CONSTRAINT topics_rollback_gre CHECK (exam_id = 'gre');
ALTER TABLE trainings ADD CONSTRAINT trainings_rollback_gre CHECK (exam_id = 'gre');
ALTER TABLE topics ADD CONSTRAINT topics_section_check CHECK (section IN ('verbal', 'quant'));
ALTER TABLE trainings ADD CONSTRAINT trainings_section_check CHECK (section IN ('verbal', 'quant'));
UPDATE trainings SET request = request - 'exam';
DROP INDEX trainings_user_exam_started_idx;
CREATE INDEX trainings_user_started_idx ON trainings (user_id, started_at DESC);
ALTER TABLE trainings DROP COLUMN exam_id;
ALTER TABLE topics DROP COLUMN exam_id;
ALTER TABLE users DROP COLUMN active_exam;
DROP TABLE exam_sections;
DROP TABLE exams;
