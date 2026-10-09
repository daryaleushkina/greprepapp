package migrations_test

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/daryaleushkina/greprepapp/server/internal/migrations"
	"github.com/daryaleushkina/greprepapp/server/internal/testdb"
)

func TestExamsRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	pool := testdb.New(t)
	sqlDB := stdlib.OpenDBFromPool(pool)
	t.Cleanup(func() {
		if err := sqlDB.Close(); err != nil {
			t.Error(err)
		}
	})
	p, err := goose.NewProvider(goose.DialectPostgres, sqlDB, migrations.FS())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := p.Down(ctx); err != nil {
		t.Fatalf("initial Down to version 2: %v", err)
	}
	exec := func(query string) {
		t.Helper()
		if _, err := pool.Exec(ctx, query); err != nil {
			t.Fatal(err)
		}
	}
	// Данные старого сервера: запрос без exam и уже сохранённый ответ.
	exec(`INSERT INTO users (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Fixture')`)
	exec(`INSERT INTO topics (id, section, title_ru, title_en) VALUES ('legacy', 'verbal', 'Тест', 'Fixture')`)
	exec(`INSERT INTO questions (id, question_type, topic_id, difficulty, body, answer, explanation)
		VALUES ('00000000-0000-4000-8000-000000000002', 'text_completion', 'legacy', 'easy', '{}', ARRAY['A'], '{}')`)
	exec(`INSERT INTO trainings (id, user_id, mode, section, question_types, request)
		VALUES ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001',
		'practice', 'verbal', ARRAY['text_completion'], '{"section":"verbal","questionTypes":["text_completion"],"count":1,"mode":"practice"}')`)
	exec(`INSERT INTO training_items (training_id, position, question_id, option_ids, answered_at, elapsed_ms, correct)
		VALUES ('00000000-0000-4000-8000-000000000003', 0, '00000000-0000-4000-8000-000000000002', ARRAY['A'], now(), 1000, true)`)
	up := func() {
		t.Helper()
		if res, err := p.Up(ctx); err != nil || len(res) != 1 {
			t.Fatalf("Up: %d migrations, %v", len(res), err)
		}
	}
	up()
	var oldAbsent bool
	if err := pool.QueryRow(ctx, "SELECT to_regclass('trainings_user_started_idx') IS NULL").Scan(&oldAbsent); err != nil || !oldAbsent {
		t.Fatalf("redundant index retained: %v, %v", oldAbsent, err)
	}
	var migrated bool
	err = pool.QueryRow(ctx, `SELECT t.exam_id = 'gre' AND tr.exam_id = 'gre' AND tr.request->>'exam' = 'gre'
		AND u.active_exam IS NULL AND i.correct AND i.elapsed_ms = 1000 AND i.answered_at IS NOT NULL
		FROM topics t, trainings tr, users u, training_items i`).Scan(&migrated)
	if err != nil || !migrated {
		t.Fatalf("legacy data not preserved: %v, %v", migrated, err)
	}
	for _, query := range []string{
		`UPDATE users SET active_exam = 'unknown'`,
		`UPDATE topics SET exam_id = 'toefl'`,
		`UPDATE trainings SET exam_id = 'toefl'`,
		`INSERT INTO exam_sections (exam_id, section, position) VALUES ('gre', 'duplicate-position', 0)`,
	} {
		if _, err := pool.Exec(ctx, query); err == nil {
			t.Fatalf("constraint accepted: %s", query)
		}
	}
	if _, err := p.Down(ctx); err != nil {
		t.Fatalf("Down with GRE data: %v", err)
	}
	var oldRestored bool
	if err := pool.QueryRow(ctx, "SELECT to_regclass('trainings_user_started_idx') IS NOT NULL").Scan(&oldRestored); err != nil || !oldRestored {
		t.Fatalf("Down did not restore index: %v, %v", oldRestored, err)
	}
	var restored bool
	err = pool.QueryRow(ctx, `SELECT NOT (tr.request ? 'exam') AND i.correct AND i.elapsed_ms = 1000
		FROM trainings tr, training_items i`).Scan(&restored)
	if err != nil || !restored {
		t.Fatalf("Down lost data or request format: %v, %v", restored, err)
	}
	up()
	exec(`INSERT INTO topics (id, exam_id, section, title_ru, title_en) VALUES ('new-reading', 'toefl', 'reading', 'Тест', 'Fixture')`)
	if _, err := p.Down(ctx); err == nil {
		t.Fatal("Down silently discarded the exam of TOEFL data")
	}
	var intact bool
	err = pool.QueryRow(ctx, `SELECT exam_id = 'toefl' AND section = 'reading' FROM topics WHERE id = 'new-reading'`).Scan(&intact)
	if err != nil || !intact {
		t.Fatalf("failed Down was not transactional: %v, %v", intact, err)
	}
	// Следующий экзамен и его раздел — строки, без изменения схемы.
	exec(`INSERT INTO exams (id) VALUES ('sat')`)
	exec(`INSERT INTO exam_sections (exam_id, section, position) VALUES ('sat', 'math', 0)`)
	exec(`INSERT INTO topics (id, exam_id, section, title_ru, title_en) VALUES ('sat-math', 'sat', 'math', 'Тест', 'Fixture')`)
}

// Индекс проверяется на свежих строках отдельно от Up/Down: после переноса старых HOT-цепочек
// PostgreSQL временно запрещает его использование (indcheckxmin), пока живы старые транзакции.
func TestTrainingIndexUserPrefix(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	pool := testdb.New(t)
	for _, query := range []string{
		`INSERT INTO users (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Fixture')`,
		`INSERT INTO trainings (user_id, mode, section, question_types, request, exam_id) VALUES ('00000000-0000-4000-8000-000000000001', 'practice', 'verbal', ARRAY['text_completion'], '{}', 'gre')`,
	} {
		if _, err := pool.Exec(ctx, query); err != nil {
			t.Fatal(err)
		}
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	// Одна строка сама по себе дешевле читается последовательно; проверяем доступность индексного пути.
	if _, err := tx.Exec(ctx, "SET LOCAL enable_seqscan = off"); err != nil {
		t.Fatal(err)
	}
	var rawPlan []byte
	if err := tx.QueryRow(ctx, `EXPLAIN (FORMAT JSON) SELECT id FROM trainings WHERE user_id = '00000000-0000-4000-8000-000000000001'`).Scan(&rawPlan); err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	type planNode struct {
		IndexName string `json:"Index Name"`
		IndexCond string `json:"Index Cond"`
		Plans     []planNode
	}
	var plan []struct{ Plan planNode }
	if err := json.Unmarshal(rawPlan, &plan); err != nil {
		t.Fatal(err)
	}
	// Планировщик может выбрать прямое сканирование или Bitmap Heap Scan с индексным дочерним узлом.
	var usesPrefix func(planNode) bool
	usesPrefix = func(node planNode) bool {
		if node.IndexName == "trainings_user_exam_started_idx" && strings.Contains(node.IndexCond, "user_id") {
			return true
		}
		return slices.ContainsFunc(node.Plans, usesPrefix)
	}
	if len(plan) != 1 || !usesPrefix(plan[0].Plan) {
		t.Fatalf("user prefix not usable: %s", rawPlan)
	}
}
