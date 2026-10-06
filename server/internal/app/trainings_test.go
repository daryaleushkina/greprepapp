package app

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/daryaleushkina/greprepapp/server/internal/devseed"
)

// seed — набор заданий для разработки (26 заданий: 16 Verbal, 10 Quant).
func (e *env) seed(t *testing.T) {
	t.Helper()
	set, err := devseed.Load()
	if err != nil {
		t.Fatal(err)
	}
	if err := devseed.Apply(context.Background(), e.pool, set); err != nil {
		t.Fatal(err)
	}
}

func (e *env) exec(t *testing.T, sql string, args ...any) {
	t.Helper()
	if _, err := e.pool.Exec(context.Background(), sql, args...); err != nil {
		t.Fatal(err)
	}
}

func (e *env) start(t *testing.T, token string, body map[string]any) map[string]any {
	t.Helper()
	r := e.do(t, call{method: "POST", path: "/api/trainings", bearer: token, body: body})
	if r.status != http.StatusCreated {
		t.Fatalf("start training: %d %s", r.status, r.raw)
	}
	return r.body
}

func practice(section string, count int, types ...string) map[string]any {
	return map[string]any{"section": section, "questionTypes": types, "count": count, "mode": "practice"}
}

func items(t *testing.T, session map[string]any) []map[string]any {
	t.Helper()
	raw, _ := session["items"].([]any)
	out := make([]map[string]any, 0, len(raw))
	for _, it := range raw {
		m, ok := it.(map[string]any)
		if !ok {
			t.Fatalf("item is not an object: %v", it)
		}
		out = append(out, m)
	}
	return out
}

func question(t *testing.T, item map[string]any) map[string]any {
	t.Helper()
	q, ok := item["question"].(map[string]any)
	if !ok {
		t.Fatalf("item without question: %v", item)
	}
	return q
}

func strs(v any) []string {
	raw, _ := v.([]any)
	out := make([]string, 0, len(raw))
	for _, x := range raw {
		s, _ := x.(string)
		out = append(out, s)
	}
	return out
}

// wrongOption — первый вариант задания, которого нет в ключе.
func wrongOption(t *testing.T, q map[string]any) string {
	t.Helper()
	answer := strs(q["answer"])
	groups, _ := q["groups"].([]any)
	for _, g := range groups {
		opts, _ := g.(map[string]any)["options"].([]any)
		for _, o := range opts {
			id, _ := o.(map[string]any)["id"].(string)
			if !slices.Contains(answer, id) {
				return id
			}
		}
	}
	t.Fatalf("question without a wrong option: %v", q)
	return ""
}

func answer(position int, ids []string, at time.Time) map[string]any {
	if ids == nil {
		ids = []string{}
	}
	return map[string]any{
		"position": position, "optionIds": ids, "dontKnow": false, "flagged": false,
		"answeredAt": at.UTC().Format(time.RFC3339Nano), "elapsedMs": 4000,
	}
}

func (e *env) submit(t *testing.T, token, id string, answers ...map[string]any) resp {
	t.Helper()
	return e.do(t, call{method: "POST", path: "/api/trainings/" + id + "/answers", bearer: token, body: map[string]any{"answers": answers}})
}

func (e *env) finish(t *testing.T, token, id string, at time.Time, timedOut bool) resp {
	t.Helper()
	body := map[string]any{"finishedAt": at.UTC().Format(time.RFC3339Nano), "timedOut": timedOut}
	return e.do(t, call{method: "POST", path: "/api/trainings/" + id + "/finish", bearer: token, body: body})
}

// optionsPath — клиент, который умеет показывать все типы первого среза.
const optionsPath = "/api/trainings/options?types=text_completion&types=sentence_equivalence&types=quantitative_comparison&types=multiple_choice"

func num(v any) int {
	f, _ := v.(float64)
	return int(f)
}

func TestTrainingOptions(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	token, _ := e.devSignIn(t, "options", "")

	wantError(t, e.do(t, call{method: "GET", path: optionsPath}), http.StatusUnauthorized, "unauthorized")

	// Контента ещё нет: типы есть, тем и наборов нет.
	empty := e.do(t, call{method: "GET", path: optionsPath, bearer: token})
	types, _ := empty.body["types"].([]any)
	presets, _ := empty.body["presets"].([]any)
	if empty.status != http.StatusOK || len(types) != 4 || len(presets) != 0 || num(empty.body["maxQuestions"]) != 50 {
		t.Fatalf("options without content: %d %s", empty.status, empty.raw)
	}

	e.seed(t)
	// Черновик в счёт не идёт: конструктор не обещает того, чего не выдаст.
	e.exec(t, "UPDATE questions SET status = 'draft' WHERE id = 'd3f00000-0000-4000-8000-000000000001'")
	r := e.do(t, call{method: "GET", path: optionsPath, bearer: token})
	if r.status != http.StatusOK {
		t.Fatalf("options: %d %s", r.status, r.raw)
	}
	total := map[string]int{}
	pace := map[string]int{}
	var contrast map[string]any
	types, _ = r.body["types"].([]any)
	for _, raw := range types {
		ty, _ := raw.(map[string]any)
		qt, _ := ty["questionType"].(string)
		pace[qt] = num(ty["paceSeconds"])
		topics, _ := ty["topics"].([]any)
		for _, rawTopic := range topics {
			topic, _ := rawTopic.(map[string]any)
			counts, _ := topic["available"].(map[string]any)
			total[qt] += num(counts["easy"]) + num(counts["medium"]) + num(counts["hard"])
			if qt == "text_completion" && topic["id"] == "contrast-signals" {
				contrast = topic
			}
		}
	}
	want := map[string]int{"text_completion": 9, "sentence_equivalence": 6, "quantitative_comparison": 5, "multiple_choice": 5}
	if fmt.Sprint(total) != fmt.Sprint(want) {
		t.Fatalf("available = %v, want %v", total, want)
	}
	if pace["text_completion"] != 90 || pace["multiple_choice"] != 105 {
		t.Fatalf("pace = %v", pace)
	}
	// В теме контраста у Text Completion — одно лёгкое и два средних (третье средних — черновик).
	counts, _ := contrast["available"].(map[string]any)
	title, _ := contrast["title"].(map[string]any)
	if num(counts["easy"]) != 1 || num(counts["medium"]) != 2 || num(counts["hard"]) != 0 || title["ru"] != "Слова-сигналы контраста" {
		t.Fatalf("contrast topic = %v", contrast)
	}

	// Тренировок не было — только «Проверка на время» по Verbal.
	presets, _ = r.body["presets"].([]any)
	if len(presets) != 1 {
		t.Fatalf("presets = %v", presets)
	}
	timed, _ := presets[0].(map[string]any)
	req, _ := timed["request"].(map[string]any)
	if timed["kind"] != "timed" || req["section"] != "verbal" || req["mode"] != "check" || num(req["count"]) != 12 ||
		fmt.Sprint(strs(req["questionTypes"])) != "[text_completion sentence_equivalence]" {
		t.Fatalf("timed preset = %v", timed)
	}

	// После тренировки по Quant — «Как в прошлый раз» с тем же запросом, и «Проверка» — по Quant.
	last := map[string]any{"section": "quant", "questionTypes": []string{"multiple_choice"}, "topicIds": []string{"percents"}, "difficulty": "easy", "count": 3, "mode": "practice"}
	e.start(t, token, last)
	r = e.do(t, call{method: "GET", path: optionsPath, bearer: token})
	presets, _ = r.body["presets"].([]any)
	if len(presets) != 2 {
		t.Fatalf("presets after a training = %s", r.raw)
	}
	first, _ := presets[0].(map[string]any)
	lastReq, _ := first["request"].(map[string]any)
	second, _ := presets[1].(map[string]any)
	timedReq, _ := second["request"].(map[string]any)
	if first["kind"] != "last" || lastReq["difficulty"] != "easy" || fmt.Sprint(strs(lastReq["topicIds"])) != "[percents]" ||
		timedReq["section"] != "quant" || fmt.Sprint(strs(timedReq["questionTypes"])) != "[quantitative_comparison multiple_choice]" {
		t.Fatalf("presets = %s", r.raw)
	}

	// Старое приложение умеет только Text Completion: других типов и наборов с ними оно не получает —
	// прошлая тренировка по Quant не предлагается, «Проверка» собирается из того, что оно покажет.
	old := e.do(t, call{method: "GET", path: "/api/trainings/options?types=text_completion", bearer: token})
	types, _ = old.body["types"].([]any)
	presets, _ = old.body["presets"].([]any)
	if old.status != http.StatusOK || len(types) != 1 || len(presets) != 1 {
		t.Fatalf("options for an old client: %d %s", old.status, old.raw)
	}
	only, _ := presets[0].(map[string]any)
	onlyReq, _ := only["request"].(map[string]any)
	if only["kind"] != "timed" || fmt.Sprint(strs(onlyReq["questionTypes"])) != "[text_completion]" {
		t.Fatalf("old client presets = %s", old.raw)
	}
	for _, path := range []string{"/api/trainings/options", "/api/trainings/options?types=reading_aloud"} {
		wantError(t, e.do(t, call{method: "GET", path: path, bearer: token}), http.StatusBadRequest, "bad_request")
	}
}

func TestStartTraining(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	e.seed(t)
	token, _ := e.devSignIn(t, "starter", "")
	other, _ := e.devSignIn(t, "stranger", "")

	s := e.start(t, token, practice("verbal", 5, "text_completion"))
	got := items(t, s)
	if len(got) != 5 || s["mode"] != "practice" || s["timeLimitSeconds"] != nil || s["finishedAt"] != nil {
		t.Fatalf("session = %v", s)
	}
	seen := map[string]bool{}
	for i, it := range got {
		q := question(t, it)
		id, _ := q["id"].(string)
		expl, _ := q["explanation"].(map[string]any)
		if num(it["position"]) != i || q["questionType"] != "text_completion" || q["section"] != "verbal" ||
			len(strs(q["answer"])) == 0 || expl["solution"] == nil || seen[id] || it["answer"] != nil {
			t.Fatalf("item %d = %v", i, it)
		}
		seen[id] = true
	}

	// Своя — открывается, чужая и несуществующая — 404 одинаково.
	id, _ := s["id"].(string)
	again := e.do(t, call{method: "GET", path: "/api/trainings/" + id, bearer: token})
	if again.status != http.StatusOK || again.body["id"] != id || len(items(t, again.body)) != 5 {
		t.Fatalf("get own: %d %s", again.status, again.raw)
	}
	wantError(t, e.do(t, call{method: "GET", path: "/api/trainings/" + id, bearer: other}), http.StatusNotFound, "not_found")
	wantError(t, e.do(t, call{method: "GET", path: "/api/trainings/" + uuid.NewString(), bearer: token}), http.StatusNotFound, "not_found")
	wantError(t, e.do(t, call{method: "GET", path: "/api/trainings/" + id}), http.StatusUnauthorized, "unauthorized")

	// «Проверка»: заданий меньше, чем просили, — выдаётся сколько есть, время — по темпу Quant.
	check := e.start(t, token, map[string]any{"section": "quant", "questionTypes": []string{"quantitative_comparison", "multiple_choice"}, "count": 50, "mode": "check"})
	if n := len(items(t, check)); n != 10 || num(check["timeLimitSeconds"]) != 10*105 {
		t.Fatalf("check session: %d items, limit %v", n, check["timeLimitSeconds"])
	}
	qc := question(t, items(t, check)[0])
	if qc["questionType"] == "quantitative_comparison" && (qc["quantityA"] == nil || qc["quantityB"] == nil) {
		t.Fatalf("quantitative comparison without quantities: %v", qc)
	}

	// Фильтры темы и сложности.
	hard := e.start(t, token, map[string]any{"section": "quant", "questionTypes": []string{"quantitative_comparison"}, "difficulty": "hard", "count": 10, "mode": "practice"})
	for _, it := range items(t, hard) {
		if question(t, it)["difficulty"] != "hard" {
			t.Fatalf("difficulty filter: %v", it)
		}
	}
	if n := len(items(t, hard)); n != 2 {
		t.Fatalf("hard quantitative comparison: %d, want 2", n)
	}
	topic := e.start(t, token, map[string]any{"section": "quant", "questionTypes": []string{"multiple_choice"}, "topicIds": []string{"percents"}, "count": 10, "mode": "practice"})
	if its := items(t, topic); len(its) != 1 || question(t, its[0])["topicId"] != "percents" {
		t.Fatalf("topic filter: %v", topic)
	}
}

func TestStartTrainingRejects(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	token, _ := e.devSignIn(t, "rejects", "")

	// Контента нет — 409 с кодом, чтобы конструктор сказал «заданий пока нет», а не «ошибка».
	wantError(t, e.do(t, call{method: "POST", path: "/api/trainings", bearer: token, body: practice("verbal", 5, "text_completion")}), http.StatusConflict, "no_questions")

	e.seed(t)
	bad := []map[string]any{
		practice("verbal", 5, "quantitative_comparison"),
		practice("words", 5, "text_completion"),
		practice("verbal", 0, "text_completion"),
		practice("verbal", 51, "text_completion"),
		practice("verbal", 5),
		practice("verbal", 5, "text_completion", "text_completion"),
		practice("verbal", 5, "reading_comprehension"),
		{"section": "verbal", "questionTypes": []string{"text_completion"}, "count": 5, "mode": "practice", "extra": true},
		{"section": "verbal", "questionTypes": []string{"text_completion"}, "count": 5, "mode": "exam"},
	}
	for _, body := range bad {
		wantError(t, e.do(t, call{method: "POST", path: "/api/trainings", bearer: token, body: body}), http.StatusBadRequest, "bad_request")
	}
	noTopic := map[string]any{"section": "verbal", "questionTypes": []string{"text_completion"}, "topicIds": []string{"no-such-topic"}, "count": 5, "mode": "practice"}
	wantError(t, e.do(t, call{method: "POST", path: "/api/trainings", bearer: token, body: noTopic}), http.StatusConflict, "no_questions")
	wantError(t, e.do(t, call{method: "POST", path: "/api/trainings", body: practice("verbal", 5, "text_completion")}), http.StatusUnauthorized, "unauthorized")
}

func TestTrainingsUseOnlyApprovedQuestions(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	e.seed(t)
	token, _ := e.devSignIn(t, "approved", "")
	keep := "d3f00000-0000-4000-8000-000000000011" // первое Sentence Equivalence
	e.exec(t, "UPDATE questions SET status = 'draft' WHERE question_type = 'sentence_equivalence' AND id <> $1 AND id < 'd3f00000-0000-4000-8000-000000000014'", keep)
	e.exec(t, "UPDATE questions SET status = 'retired' WHERE question_type = 'sentence_equivalence' AND id >= 'd3f00000-0000-4000-8000-000000000014'")
	s := e.start(t, token, practice("verbal", 50, "sentence_equivalence"))
	if its := items(t, s); len(its) != 1 || question(t, its[0])["id"] != keep {
		t.Fatalf("only the approved question expected: %v", s)
	}
}

func TestTrainingPrefersUnseenQuestions(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	e.seed(t)
	token, _ := e.devSignIn(t, "unseen", "")
	ids := func(s map[string]any) []string {
		var out []string
		for _, it := range items(t, s) {
			id, _ := question(t, it)["id"].(string)
			out = append(out, id)
		}
		return out
	}
	// Sentence Equivalence в наборе шесть: вторая тройка — из тех, что ещё не попадались.
	first := ids(e.start(t, token, practice("verbal", 3, "sentence_equivalence")))
	second := ids(e.start(t, token, practice("verbal", 3, "sentence_equivalence")))
	for _, id := range second {
		if slices.Contains(first, id) {
			t.Fatalf("seen question %s came back while unseen remained: %v then %v", id, first, second)
		}
	}
	// Все уже видены — задания всё равно выдаются.
	if all := ids(e.start(t, token, practice("verbal", 6, "sentence_equivalence"))); len(all) != 6 {
		t.Fatalf("after everything is seen: %v", all)
	}
}

func TestTrainingAnswersAndSummary(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	e.seed(t)
	token, _ := e.devSignIn(t, "answers", "")
	other, _ := e.devSignIn(t, "intruder", "")

	s := e.start(t, token, practice("verbal", 4, "text_completion"))
	id, _ := s["id"].(string)
	its := items(t, s)
	q0, q1 := question(t, its[0]), question(t, its[1])
	now := time.Now()
	dontKnow := answer(2, nil, now)
	dontKnow["dontKnow"] = true
	if r := e.submit(t, token, id, answer(0, strs(q0["answer"]), now), answer(1, []string{wrongOption(t, q1)}, now), dontKnow); r.status != http.StatusNoContent {
		t.Fatalf("submit: %d %s", r.status, r.raw)
	}
	// Повтор той же очереди и попытка исправить ответ после разбора: в «Практике» остаётся первый ответ.
	if r := e.submit(t, token, id, answer(1, strs(q1["answer"]), now.Add(time.Minute))); r.status != http.StatusNoContent {
		t.Fatalf("resubmit: %d %s", r.status, r.raw)
	}

	got := items(t, e.do(t, call{method: "GET", path: "/api/trainings/" + id, bearer: token}).body)
	a1, _ := got[1]["answer"].(map[string]any)
	a2, _ := got[2]["answer"].(map[string]any)
	if got[0]["correct"] != true || got[1]["correct"] != false || fmt.Sprint(strs(a1["optionIds"])) != fmt.Sprint([]string{wrongOption(t, q1)}) ||
		got[2]["correct"] != false || a2["dontKnow"] != true || got[3]["answer"] != nil || got[3]["correct"] != nil {
		t.Fatalf("answers = %v", got)
	}

	// Отказы: чужая тренировка, позиция вне сессии, чужой вариант, «Не знаю» с выбором, кривое тело.
	wantError(t, e.submit(t, other, id, answer(3, nil, now)), http.StatusNotFound, "not_found")
	wantError(t, e.submit(t, token, id, answer(4, nil, now)), http.StatusBadRequest, "bad_request")
	wantError(t, e.submit(t, token, id, answer(50, nil, now)), http.StatusBadRequest, "bad_request")
	wantError(t, e.submit(t, token, id, answer(3, []string{"Z"}, now)), http.StatusBadRequest, "bad_request")
	both := answer(3, strs(question(t, its[3])["answer"]), now)
	both["dontKnow"] = true
	wantError(t, e.submit(t, token, id, both), http.StatusBadRequest, "bad_request")
	wantError(t, e.do(t, call{method: "POST", path: "/api/trainings/" + id + "/answers", bearer: token, body: map[string]any{"answers": []any{}}}), http.StatusBadRequest, "bad_request")
	wantError(t, e.finish(t, other, id, now, false), http.StatusNotFound, "not_found")

	// Итог: 1 верно из 4, без ответа двое («Не знаю» и не тронутый), ошибки — по темам заданий 1–3.
	sum := e.finish(t, token, id, now.Add(-time.Hour), true)
	if sum.status != http.StatusOK || num(sum.body["correct"]) != 1 || num(sum.body["total"]) != 4 || num(sum.body["unanswered"]) != 2 ||
		num(sum.body["durationSeconds"]) != 0 {
		t.Fatalf("summary: %d %s", sum.status, sum.raw)
	}
	mistakes := 0
	review, _ := sum.body["review"].([]any)
	for _, rv := range review {
		mistakes += num(rv.(map[string]any)["mistakes"])
	}
	// Таймера у «Практики» нет: timedOut не превращает пропуск в «не успел», все три — ошибки.
	if mistakes != 3 {
		t.Fatalf("review mistakes = %d, want 3: %s", mistakes, sum.raw)
	}

	// Повторный итог — тот же, ответы после конца — 409.
	if again := e.finish(t, token, id, now, false); again.raw != sum.raw {
		t.Fatalf("finish is not idempotent:\n%s\n%s", sum.raw, again.raw)
	}
	wantError(t, e.submit(t, token, id, answer(3, nil, now)), http.StatusConflict, "training_finished")
	session := e.do(t, call{method: "GET", path: "/api/trainings/" + id, bearer: token})
	if session.body["finishedAt"] == nil {
		t.Fatalf("finished training without finishedAt: %s", session.raw)
	}
}

func TestCheckTrainingTimesOut(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	e.seed(t)
	token, _ := e.devSignIn(t, "checker", "")
	s := e.start(t, token, map[string]any{"section": "quant", "questionTypes": []string{"multiple_choice"}, "count": 3, "mode": "check"})
	id, _ := s["id"].(string)
	its := items(t, s)
	q0 := question(t, its[0])
	now := time.Now()

	// В «Проверке» ответ можно поменять; очередь без сети может прийти не по порядку — остаётся поздний.
	late := answer(0, strs(q0["answer"]), now.Add(time.Minute))
	early := answer(0, []string{wrongOption(t, q0)}, now)
	flagged := answer(1, nil, now)
	flagged["flagged"] = true
	if r := e.submit(t, token, id, late, flagged); r.status != http.StatusNoContent {
		t.Fatalf("submit: %d %s", r.status, r.raw)
	}
	if r := e.submit(t, token, id, early); r.status != http.StatusNoContent {
		t.Fatalf("submit early: %d %s", r.status, r.raw)
	}
	got := items(t, e.do(t, call{method: "GET", path: "/api/trainings/" + id, bearer: token}).body)
	a1, _ := got[1]["answer"].(map[string]any)
	if got[0]["correct"] != true || a1["flagged"] != true {
		t.Fatalf("answers = %v", got)
	}

	// Человек передумал: сначала верно, потом неверно — остаётся последнее.
	if r := e.submit(t, token, id, answer(0, []string{wrongOption(t, q0)}, now.Add(2*time.Minute))); r.status != http.StatusNoContent {
		t.Fatalf("submit change: %d %s", r.status, r.raw)
	}
	got = items(t, e.do(t, call{method: "GET", path: "/api/trainings/" + id, bearer: token}).body)
	if got[0]["correct"] != false {
		t.Fatalf("a later answer must replace an earlier one: %v", got[0])
	}

	// Часы устройства спешат на час: такой ответ не должен навсегда закрыть вопрос для следующих.
	if r := e.submit(t, token, id, answer(2, []string{wrongOption(t, question(t, its[2]))}, now.Add(time.Hour))); r.status != http.StatusNoContent {
		t.Fatalf("submit future: %d %s", r.status, r.raw)
	}
	if r := e.submit(t, token, id, answer(2, strs(question(t, its[2])["answer"]), time.Now().Add(time.Second))); r.status != http.StatusNoContent {
		t.Fatalf("submit after future: %d %s", r.status, r.raw)
	}
	got = items(t, e.do(t, call{method: "GET", path: "/api/trainings/" + id, bearer: token}).body)
	if got[2]["correct"] != true {
		t.Fatalf("an answer from the future froze the question: %v", got[2])
	}

	// Время вышло: неотвеченный — «не успел», не ошибка темы; длительность — не больше лимита, даже если
	// тренировку закрыли через час после начала.
	e.exec(t, "UPDATE trainings SET started_at = now() - interval '1 hour' WHERE id = $1", id)
	sum := e.finish(t, token, id, time.Now(), true)
	review, _ := sum.body["review"].([]any)
	if sum.status != http.StatusOK || num(sum.body["correct"]) != 1 || num(sum.body["unanswered"]) != 1 || len(review) != 1 ||
		num(sum.body["durationSeconds"]) != 3*105 {
		t.Fatalf("timed-out summary: %d %s", sum.status, sum.raw)
	}
}

// Ответы и завершение одной тренировки не перехлёстываются: если ответ принят, он есть в итоге; если
// тренировка уже закончена, ответ отклонён.
func TestAnswersRaceWithFinish(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	e.seed(t)
	token, _ := e.devSignIn(t, "racer", "")
	for range 8 {
		s := e.start(t, token, practice("quant", 1, "multiple_choice"))
		id, _ := s["id"].(string)
		right := strs(question(t, items(t, s)[0])["answer"])
		var wg sync.WaitGroup
		var submitted, finished resp
		wg.Go(func() { submitted = e.submit(t, token, id, answer(0, right, time.Now())) })
		wg.Go(func() { finished = e.finish(t, token, id, time.Now(), false) })
		wg.Wait()
		switch {
		case submitted.status == http.StatusNoContent && num(finished.body["correct"]) == 1:
		case submitted.status == http.StatusConflict && num(finished.body["correct"]) == 0:
		default:
			t.Fatalf("answer %d %s, summary %s", submitted.status, submitted.raw, finished.raw)
		}
	}
}

// Испорченный контент в базе и сбой базы — 500 internal без подробностей, а не пустой ответ или паника.
func TestTrainingsWhenStorageBreaks(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	e.seed(t)
	token, _ := e.devSignIn(t, "broken", "")
	s := e.start(t, token, practice("quant", 2, "multiple_choice"))
	id, _ := s["id"].(string)
	qid, _ := question(t, items(t, s)[0])["id"].(string)
	internal := func(r resp) {
		t.Helper()
		wantError(t, r, http.StatusInternalServerError, "internal")
		if r.body["message"] != "internal error" {
			t.Fatalf("internal error leaks details: %s", r.raw)
		}
	}
	get := func() resp { return e.do(t, call{method: "GET", path: "/api/trainings/" + id, bearer: token}) }

	e.exec(t, "UPDATE questions SET body = '[]' WHERE id = $1", qid)
	internal(get())
	internal(e.submit(t, token, id, answer(0, nil, time.Now())))
	e.exec(t, "UPDATE questions SET body = (SELECT body FROM questions WHERE id <> $1 AND question_type = 'multiple_choice' LIMIT 1), explanation = '[]' WHERE id = $1", qid)
	internal(get())
	internal(e.do(t, call{method: "POST", path: "/api/trainings", bearer: token, body: practice("quant", 50, "multiple_choice")}))

	// Прошлый запрос не читается (старый формат) — конструктор всё равно открывается, без «Как в прошлый раз»;
	// сбой — в журнал сервера.
	e.exec(t, "UPDATE trainings SET request = '[]'")
	opts := e.do(t, call{method: "GET", path: optionsPath, bearer: token})
	presets, _ := opts.body["presets"].([]any)
	for _, p := range presets {
		if p.(map[string]any)["kind"] == "last" {
			t.Fatalf("unreadable last request offered as a preset: %s", opts.raw)
		}
	}
	if opts.status != http.StatusOK {
		t.Fatalf("options with an unreadable last request: %d %s", opts.status, opts.raw)
	}

	e.exec(t, "ALTER TABLE training_items RENAME TO training_items_gone")
	internal(get())
	internal(e.submit(t, token, id, answer(0, nil, time.Now())))
	internal(e.finish(t, token, id, time.Now(), false))
	internal(e.do(t, call{method: "POST", path: "/api/questions/" + qid + "/reports", bearer: token, body: map[string]any{"kind": "other"}}))

	e.exec(t, "ALTER TABLE question_reports RENAME TO question_reports_gone")
	e.exec(t, "ALTER TABLE training_items_gone RENAME TO training_items")
	internal(e.do(t, call{method: "POST", path: "/api/questions/" + qid + "/reports", bearer: token, body: map[string]any{"kind": "other"}}))

	e.exec(t, "ALTER TABLE trainings RENAME TO trainings_gone")
	internal(get())
	internal(e.do(t, call{method: "GET", path: optionsPath, bearer: token}))
	internal(e.do(t, call{method: "POST", path: "/api/trainings", bearer: token, body: practice("quant", 1, "multiple_choice")}))

	e.exec(t, "ALTER TABLE questions RENAME TO questions_gone")
	internal(e.do(t, call{method: "GET", path: optionsPath, bearer: token}))
}

func TestQuestionReports(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	e.seed(t)
	token, _ := e.devSignIn(t, "reporter", "")
	other, _ := e.devSignIn(t, "bystander", "")
	s := e.start(t, token, practice("verbal", 1, "sentence_equivalence"))
	tid, _ := s["id"].(string)
	qid, _ := question(t, items(t, s)[0])["id"].(string)
	report := func(bearer, question string, body map[string]any) resp {
		return e.do(t, call{method: "POST", path: "/api/questions/" + question + "/reports", bearer: bearer, body: body})
	}

	if r := report(token, qid, map[string]any{"kind": "translation", "text": "Опечатка в английском разборе.", "trainingId": tid}); r.status != http.StatusNoContent {
		t.Fatalf("report: %d %s", r.status, r.raw)
	}
	// Снятое потом задание из своей тренировки — тоже можно.
	e.exec(t, "UPDATE questions SET status = 'retired' WHERE id = $1", qid)
	if r := report(token, qid, map[string]any{"kind": "other"}); r.status != http.StatusNoContent {
		t.Fatalf("report on retired own question: %d %s", r.status, r.raw)
	}
	var n int
	var kind, text string
	err := e.pool.QueryRow(context.Background(), "SELECT count(*) OVER (), kind, coalesce(text, '') FROM question_reports ORDER BY id LIMIT 1").Scan(&n, &kind, &text)
	if err != nil || n != 2 || kind != "translation" || text != "Опечатка в английском разборе." {
		t.Fatalf("reports: %d %q %q %v", n, kind, text, err)
	}

	wantError(t, report(other, qid, map[string]any{"kind": "other"}), http.StatusNotFound, "not_found")
	wantError(t, report(token, uuid.NewString(), map[string]any{"kind": "other"}), http.StatusNotFound, "not_found")
	draft := "d3f00000-0000-4000-8000-000000000002"
	e.exec(t, "UPDATE questions SET status = 'draft' WHERE id = $1", draft)
	wantError(t, report(token, draft, map[string]any{"kind": "other"}), http.StatusNotFound, "not_found")
	approved := "d3f00000-0000-4000-8000-000000000003"
	wantError(t, report(other, approved, map[string]any{"kind": "other", "trainingId": tid}), http.StatusNotFound, "not_found")
	// Своя тренировка, но задание не из неё — привязка была бы ложной.
	wantError(t, report(token, approved, map[string]any{"kind": "other", "trainingId": tid}), http.StatusNotFound, "not_found")
	wantError(t, report(token, approved, map[string]any{"kind": "wrong"}), http.StatusBadRequest, "bad_request")
	long := make([]rune, 2001)
	for i := range long {
		long[i] = 'я'
	}
	wantError(t, report(token, approved, map[string]any{"kind": "other", "text": string(long)}), http.StatusBadRequest, "bad_request")
	wantError(t, report("", approved, map[string]any{"kind": "other"}), http.StatusUnauthorized, "unauthorized")
}
