package app

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"
)

func TestExams(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	r := e.do(t, call{method: "GET", path: "/api/exams"})
	if r.status != http.StatusOK {
		t.Fatalf("exams: %d %s", r.status, r.raw)
	}
	exams, _ := r.body["exams"].([]any)
	if len(exams) != 2 {
		t.Fatalf("exams = %s", r.raw)
	}
	for i, want := range []struct{ id, sections string }{
		{"gre", "[verbal quant essay]"}, {"toefl", "[reading listening writing speaking]"},
	} {
		exam, _ := exams[i].(map[string]any)
		if exam["id"] != want.id || fmt.Sprint(strs(exam["sections"])) != want.sections {
			t.Fatalf("exam %d = %v", i, exam)
		}
	}
}

func TestTrainingExamIsolation(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	e.seed(t)
	token, userID := e.devSignIn(t, "exam-training", "")
	e.exec(t, "INSERT INTO topics (id, exam_id, section, title_ru, title_en) VALUES ('foreign-reading', 'toefl', 'reading', 'Тест', 'Fixture')")
	// Будущие экзамены могут использовать одинаковое имя раздела: фильтра по section недостаточно.
	e.exec(t, "INSERT INTO exams (id) VALUES ('fixture-exam')")
	e.exec(t, "INSERT INTO exam_sections (exam_id, section, position) VALUES ('fixture-exam', 'verbal', 0)")
	e.exec(t, "INSERT INTO topics (id, exam_id, section, title_ru, title_en) VALUES ('foreign-verbal', 'fixture-exam', 'verbal', 'Тест', 'Fixture')")
	// Техническая фикстура без нового типа или контента TOEFL: даже ошибочно опубликованный GRE-тип
	// в чужой теме не может попасть в GRE-конструктор или подбор.
	e.exec(t, `INSERT INTO questions (question_type, topic_id, difficulty, status, body, answer, explanation)
		SELECT question_type, 'foreign-reading', difficulty, status, body, answer, explanation FROM questions LIMIT 1`)
	e.exec(t, `INSERT INTO questions (question_type, topic_id, difficulty, status, body, answer, explanation)
		SELECT question_type, 'foreign-verbal', difficulty, status, body, answer, explanation FROM questions
		WHERE question_type = 'text_completion' LIMIT 1`)
	wrong := []map[string]any{
		{"exam": "toefl", "section": "verbal", "questionTypes": []string{"text_completion"}, "count": 1, "mode": "practice"},
		{"exam": "gre", "section": "reading", "questionTypes": []string{"text_completion"}, "count": 1, "mode": "practice"},
		{"exam": "toefl", "section": "reading", "questionTypes": []string{"text_completion"}, "count": 1, "mode": "practice"},
		{"exam": "gre", "section": "verbal", "questionTypes": []string{"text_completion"}, "topicIds": []string{"contrast-signals", "foreign-reading"}, "count": 1, "mode": "practice"},
		{"exam": "gre", "section": "verbal", "questionTypes": []string{"text_completion"}, "topicIds": []string{"contrast-signals", "foreign-verbal"}, "count": 1, "mode": "practice"},
		{"exam": "gre", "section": "verbal", "questionTypes": []string{"text_completion"}, "topicIds": []string{"percents"}, "count": 1, "mode": "practice"},
	}
	for _, body := range wrong {
		wantError(t, e.do(t, call{method: "POST", path: "/api/trainings", bearer: token, body: body}), http.StatusBadRequest, "bad_request")
	}
	// Активный экзамен не заменяет явный exam; выбор TOEFL не мешает закончить или начать GRE.
	r := e.do(t, call{method: "PUT", path: "/api/me/exam", bearer: token, body: map[string]any{"exam": "toefl"}})
	if r.status != http.StatusOK {
		t.Fatalf("choose TOEFL: %s", r.raw)
	}
	body := practice("verbal", 1, "text_completion")
	delete(body, "exam")
	wantError(t, e.do(t, call{method: "POST", path: "/api/trainings", bearer: token, body: body}), http.StatusBadRequest, "bad_request")
	gre := e.start(t, token, practice("verbal", 50, "text_completion"))
	if gre["exam"] != "gre" || len(items(t, gre)) != 10 {
		t.Fatalf("GRE selection: %v", gre)
	}
	// Более поздняя тренировка другого экзамена не стирает «Как в прошлый раз» у GRE.
	e.exec(t, `INSERT INTO trainings (user_id, exam_id, section, mode, question_types, request, started_at)
		VALUES ($1, 'toefl', 'reading', 'practice', ARRAY['text_completion'],
		'{"exam":"toefl","section":"reading","questionTypes":["text_completion"],"count":1,"mode":"practice"}', $2)`, userID, time.Now().Add(time.Minute))
	options := e.do(t, call{method: "GET", path: optionsPath, bearer: token})
	if options.status != http.StatusOK {
		t.Fatalf("GRE options: %s", options.raw)
	}
	for _, raw := range options.body["types"].([]any) {
		ty := raw.(map[string]any)
		for _, topic := range ty["topics"].([]any) {
			if id := topic.(map[string]any)["id"]; id == "foreign-reading" || id == "foreign-verbal" {
				t.Fatal("constructor leaked a foreign topic")
			}
		}
	}
	last := options.body["presets"].([]any)[0].(map[string]any)
	if last["kind"] != "last" || last["request"].(map[string]any)["exam"] != "gre" {
		t.Fatalf("GRE preset: %v", last)
	}
	// Возможности клиента могут включать типы другого экзамена; конструктор оставляет только свои.
	toefl := e.do(t, call{method: "GET", path: "/api/trainings/options?exam=toefl&types=text_completion", bearer: token})
	if toefl.status != http.StatusOK || len(toefl.body["types"].([]any)) != 0 || len(toefl.body["presets"].([]any)) != 0 {
		t.Fatalf("TOEFL capabilities: %d %s", toefl.status, toefl.raw)
	}
	var count int
	if err := e.pool.QueryRow(context.Background(), "SELECT count(*) FROM trainings WHERE user_id = $1", userID).Scan(&count); err != nil || count != 2 {
		t.Fatalf("rejected requests created trainings: %d, %v", count, err)
	}
}

func TestDuplicateTrainingTopics(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	e.seed(t)
	token, _ := e.devSignIn(t, "duplicate-topics", "")
	body := practice("verbal", 5, "text_completion")
	body["topicIds"] = []string{"contrast-signals", "contrast-signals"}
	s := e.start(t, token, body)
	if len(items(t, s)) == 0 {
		t.Fatal("duplicate topic ids lost matching questions")
	}
	r := e.do(t, call{method: "GET", path: optionsPath, bearer: token})
	last := r.body["presets"].([]any)[0].(map[string]any)["request"].(map[string]any)
	if ids := strs(last["topicIds"]); len(ids) != 1 || ids[0] != "contrast-signals" {
		t.Fatalf("preset contains duplicates: %v", last)
	}
	body["topicIds"] = []string{"contrast-signals", "unknown", "unknown"}
	wantError(t, e.do(t, call{method: "POST", path: "/api/trainings", bearer: token, body: body}), http.StatusBadRequest, "bad_request")
}

func TestLastRequestWithoutExam(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	e.seed(t)
	token, _ := e.devSignIn(t, "legacy-request", "")
	s := e.start(t, token, practice("verbal", 3, "text_completion"))
	// Так пишет старый сервер после применения миграции: default exam_id есть, в JSON его ещё нет.
	e.exec(t, "UPDATE trainings SET request = request - 'exam' WHERE id = $1", s["id"])
	r := e.do(t, call{method: "GET", path: optionsPath, bearer: token})
	if r.status != http.StatusOK {
		t.Fatalf("options: %d %s", r.status, r.raw)
	}
	p := r.body["presets"].([]any)[0].(map[string]any)
	if p["kind"] != "last" || p["request"].(map[string]any)["exam"] != "gre" {
		t.Fatalf("legacy request lost: %s", r.raw)
	}
}

func TestChooseExam(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	token, _ := e.devSignIn(t, "exam-choice", "")
	other, _ := e.devSignIn(t, "other-exam-choice", "")
	me := func(token string) resp { return e.do(t, call{method: "GET", path: "/api/me", bearer: token}) }
	initial := me(token)
	if value, exists := initial.body["activeExam"]; !exists || value != nil {
		t.Fatalf("new account exam = %s", initial.raw)
	}
	for _, exam := range []string{"gre", "toefl", "toefl"} {
		r := e.do(t, call{method: "PUT", path: "/api/me/exam", bearer: token, body: map[string]any{"exam": exam}})
		if r.status != http.StatusOK || r.body["activeExam"] != exam || me(token).body["activeExam"] != exam {
			t.Fatalf("choose %s: %d %s", exam, r.status, r.raw)
		}
	}
	// Выбор принадлежит аккаунту: новый вход видит его, другой человек — нет.
	secondDevice, _ := e.devSignIn(t, "exam-choice", "")
	if me(secondDevice).body["activeExam"] != "toefl" || me(other).body["activeExam"] != nil {
		t.Fatal("exam choice is not isolated and shared across sessions")
	}
	for _, raw := range []string{`{"exam":"sat"}`, `{"exam":null}`, `{}`, `{"exam":"gre","extra":1}`} {
		wantError(t, e.do(t, call{method: "PUT", path: "/api/me/exam", bearer: token, rawBody: raw}), http.StatusBadRequest, "bad_request")
	}
	wantError(t, e.do(t, call{method: "PUT", path: "/api/me/exam", body: map[string]any{"exam": "gre"}}), http.StatusUnauthorized, "unauthorized")
	if me(token).body["activeExam"] != "toefl" {
		t.Fatal("rejected choice changed the account")
	}
}

func TestUnavailableExam(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	token, _ := e.devSignIn(t, "unavailable-exam", "")
	e.exec(t, "DELETE FROM exam_sections WHERE exam_id = 'toefl'")
	e.exec(t, "DELETE FROM exams WHERE id = 'toefl'")
	wantError(t, e.do(t, call{method: "PUT", path: "/api/me/exam", bearer: token, body: map[string]any{"exam": "toefl"}}), http.StatusBadRequest, "bad_request")
}

func TestExamStorageFailures(t *testing.T) {
	t.Parallel()
	for _, failure := range []struct{ name, sql, method, path string }{
		{"catalog", "ALTER TABLE exam_sections RENAME TO unavailable_sections", "GET", "/api/exams"},
		{"identities", "ALTER TABLE identities RENAME TO unavailable_identities", "PUT", "/api/me/exam"},
		{"update", `CREATE FUNCTION reject_exam() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test update failure'; END $$;
			CREATE TRIGGER reject_exam BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION reject_exam()`, "PUT", "/api/me/exam"},
	} {
		t.Run(failure.name, func(t *testing.T) {
			t.Parallel()
			e := newEnv(t, nil)
			token, id := e.devSignIn(t, "exam-storage", "")
			e.exec(t, failure.sql)
			c := call{method: failure.method, path: failure.path, bearer: token}
			if failure.method == "PUT" {
				c.body = map[string]any{"exam": "gre"}
			}
			wantError(t, e.do(t, c), http.StatusInternalServerError, "internal")
			var exam *string
			if err := e.pool.QueryRow(context.Background(), "SELECT active_exam FROM users WHERE id = $1", id).Scan(&exam); err != nil || exam != nil {
				t.Fatalf("failed choice changed the account: %v, %v", exam, err)
			}
		})
	}
}
