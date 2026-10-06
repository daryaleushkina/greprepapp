package training

import (
	"errors"
	"reflect"
	"slices"
	"strings"
	"testing"
)

func opts(ids ...string) Group {
	g := Group{}
	for _, id := range ids {
		g.Options = append(g.Options, Option{ID: id, Text: "word " + id})
	}
	return g
}

func whyNot(answer []string, groups ...Group) []OptionExplanation {
	var out []OptionExplanation
	for _, g := range groups {
		for _, o := range g.Options {
			if !slices.Contains(answer, o.ID) {
				out = append(out, OptionExplanation{OptionID: o.ID, Text: Text{Ru: "нет", En: "no"}})
			}
		}
	}
	return out
}

func question(t Type, prompt string, selectCount int, answer []string, groups ...Group) Question {
	return Question{
		Type:        t,
		Body:        Body{Prompt: prompt, Groups: groups, SelectCount: selectCount},
		Answer:      answer,
		Explanation: Explanation{Solution: Text{Ru: "потому что", En: "because"}, Options: whyNot(answer, groups...)},
	}
}

func tc1() Question {
	return question(TextCompletion, "Oddly ___ conclusions.", 1, []string{"A"}, opts("A", "B", "C", "D", "E"))
}

func tc3() Question {
	return question(TextCompletion, "Far from ___, it is ___ so reviewers concede its ___.", 1, []string{"B", "D", "G"},
		opts("A", "B", "C"), opts("D", "E", "F"), opts("G", "H", "I"))
}

func se() Question {
	return question(SentenceEquivalence, "Known for being ___, she proved flexible.", 2, []string{"A", "C"},
		opts("A", "B", "C", "D", "E", "F"))
}

func qc() Question {
	q := question(QuantitativeComparison, "Compare.", 1, []string{"A"}, opts("A", "B", "C", "D"))
	q.Body.Condition, q.Body.QuantityA, q.Body.QuantityB = "0 < x < 1", "x", "x²"
	return q
}

func mc() Question {
	return question(MultipleChoice, "What is 2 + 2?", 1, []string{"C"}, opts("A", "B", "C", "D", "E"))
}

func TestSectionAndPace(t *testing.T) {
	cases := map[Type]Section{
		TextCompletion: Verbal, SentenceEquivalence: Verbal,
		QuantitativeComparison: Quant, MultipleChoice: Quant,
		"reading_comprehension": "",
	}
	for typ, want := range cases {
		if got := SectionOf(typ); got != want {
			t.Errorf("SectionOf(%s) = %q, want %q", typ, got, want)
		}
	}
	// Первая секция экзамена: Verbal — 12 вопросов за 18 минут, Quant — за 21.
	if got := TimeLimitSeconds(Verbal, TimedCount); got != 18*60 {
		t.Errorf("verbal limit = %d", got)
	}
	if got := TimeLimitSeconds(Quant, TimedCount); got != 21*60 {
		t.Errorf("quant limit = %d", got)
	}
}

func TestValidateAcceptsEveryType(t *testing.T) {
	two := question(TextCompletion, "A ___ and ___.", 1, []string{"A", "F"}, opts("A", "B", "C"), opts("D", "E", "F"))
	for name, q := range map[string]Question{"tc1": tc1(), "tc2": two, "tc3": tc3(), "se": se(), "qc": qc(), "mc": mc()} {
		if err := Validate(q); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestValidateRejects(t *testing.T) {
	cases := map[string]func(*Question){
		"empty prompt":             func(q *Question) { q.Body.Prompt = "" },
		"long prompt":              func(q *Question) { q.Body.Prompt = strings.Repeat("я", maxPrompt+1) },
		"long quantity":            func(q *Question) { q.Body.QuantityA = strings.Repeat("x", maxSide+1) },
		"unknown type":             func(q *Question) { q.Type = "reading_comprehension" },
		"blank count mismatch":     func(q *Question) { q.Body.Prompt = "No blank here." },
		"wrong select count":       func(q *Question) { q.Body.SelectCount = 2 },
		"four options":             func(q *Question) { q.Body.Groups = []Group{opts("A", "B", "C", "D")} },
		"empty option id":          func(q *Question) { q.Body.Groups[0].Options[1].ID = "" },
		"long option id":           func(q *Question) { q.Body.Groups[0].Options[1].ID = strings.Repeat("a", maxOptionID+1) },
		"empty option text":        func(q *Question) { q.Body.Groups[0].Options[1].Text = "" },
		"repeated option id":       func(q *Question) { q.Body.Groups[0].Options[1].ID = "A" },
		"answer not an option":     func(q *Question) { q.Answer = []string{"Z"} },
		"two answers for one":      func(q *Question) { q.Answer = []string{"A", "B"} },
		"repeated answer":          func(q *Question) { q.Answer = []string{"A", "A"} },
		"no answer":                func(q *Question) { q.Answer = nil },
		"solution without en":      func(q *Question) { q.Explanation.Solution.En = "" },
		"why-not for the answer":   func(q *Question) { q.Explanation.Options[0].OptionID = "A" },
		"why-not for a stranger":   func(q *Question) { q.Explanation.Options[0].OptionID = "Z" },
		"why-not repeated":         func(q *Question) { q.Explanation.Options[1].OptionID = q.Explanation.Options[0].OptionID },
		"why-not without ru":       func(q *Question) { q.Explanation.Options[0].Text.Ru = "" },
		"wrong option unexplained": func(q *Question) { q.Explanation.Options = q.Explanation.Options[1:] },
	}
	for name, mutate := range cases {
		q := tc1()
		mutate(&q)
		if err := Validate(q); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
}

func TestValidateRejectsShapeOfEachType(t *testing.T) {
	tc := tc3()
	tc.Answer = []string{"A", "B", "D"} // два ответа в первом пропуске, ни одного в третьем
	sePrompt := se()
	sePrompt.Body.Prompt = "Two ___ blanks ___."
	seOne := se()
	seOne.Answer = []string{"A"}
	qcNoB := qc()
	qcNoB.Body.QuantityB = ""
	mcSix := mc()
	mcSix.Body.Groups = []Group{opts("A", "B", "C", "D", "E", "F")}
	for name, q := range map[string]Question{"tc per-blank answer": tc, "se blanks": sePrompt, "se one answer": seOne, "qc no B": qcNoB, "mc six": mcSix} {
		if err := Validate(q); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
}

func TestCheckAnswer(t *testing.T) {
	cases := []struct {
		name     string
		q        Question
		ids      []string
		dontKnow bool
		correct  bool
		bad      bool
	}{
		{name: "tc right", q: tc1(), ids: []string{"A"}, correct: true},
		{name: "tc wrong", q: tc1(), ids: []string{"B"}},
		{name: "empty is not an error", q: tc1()},
		{name: "dont know", q: tc1(), dontKnow: true},
		{name: "tc3 all right in any order", q: tc3(), ids: []string{"G", "B", "D"}, correct: true},
		{name: "tc3 two of three is wrong", q: tc3(), ids: []string{"B", "D", "H"}},
		{name: "tc3 partial", q: tc3(), ids: []string{"B", "D"}},
		{name: "se both", q: se(), ids: []string{"C", "A"}, correct: true},
		{name: "se one of two", q: se(), ids: []string{"A", "B"}},
		{name: "se single", q: se(), ids: []string{"A"}},
		{name: "foreign option", q: tc1(), ids: []string{"Z"}, bad: true},
		{name: "repeated option", q: se(), ids: []string{"A", "A"}, bad: true},
		{name: "two in one tc blank", q: tc3(), ids: []string{"A", "B"}, bad: true},
		{name: "three in se", q: se(), ids: []string{"A", "B", "C"}, bad: true},
		{name: "dont know with choice", q: tc1(), ids: []string{"A"}, dontKnow: true, bad: true},
	}
	for _, c := range cases {
		got, err := CheckAnswer(c.q, c.ids, c.dontKnow)
		if c.bad {
			if !errors.Is(err, ErrBadAnswer) {
				t.Errorf("%s: err = %v, want ErrBadAnswer", c.name, err)
			}
			continue
		}
		if err != nil || got != c.correct {
			t.Errorf("%s: correct = %v, err = %v; want %v", c.name, got, err, c.correct)
		}
	}
}

func TestSummarize(t *testing.T) {
	contrast := Text{Ru: "Контраст", En: "Contrast"}
	cause := Text{Ru: "Причина", En: "Cause"}
	tone := Text{Ru: "Тон", En: "Tone"}
	vocab := Text{Ru: "Лексика", En: "Vocabulary"}
	results := []Result{
		{Position: 0, TopicID: "cause", Title: cause, Answered: true},                      // ошибка
		{Position: 1, TopicID: "contrast", Title: contrast, Answered: true, Correct: true}, // верно
		{Position: 2, TopicID: "contrast", Title: contrast, Answered: true},                // ошибка
		{Position: 3, TopicID: "tone", Title: tone, DontKnow: true},                        // «Не знаю» — ошибка
		{Position: 4, TopicID: "contrast", Title: contrast},                                // пропуск
		{Position: 5, TopicID: "vocab", Title: vocab, Answered: true},                      // четвёртая тема
	}
	got := Summarize(results, false)
	want := Summary{Correct: 1, Total: 6, Unanswered: 2, Review: []TopicToReview{
		{TopicID: "contrast", Title: contrast, Mistakes: 2, Positions: []int{2, 4}},
		{TopicID: "cause", Title: cause, Mistakes: 1, Positions: []int{0}},
		{TopicID: "tone", Title: tone, Mistakes: 1, Positions: []int{3}},
	}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("summary = %+v\nwant %+v", got, want)
	}

	// Время вышло: неотвеченное — «не успел», не ошибка темы; «Не знаю» по-прежнему ошибка.
	timed := Summarize(results, true)
	if timed.Unanswered != 2 || len(timed.Review) != 3 || timed.Review[0].Mistakes != 1 {
		t.Fatalf("timed summary = %+v", timed)
	}
	for _, r := range timed.Review {
		if r.TopicID == "contrast" && !reflect.DeepEqual(r.Positions, []int{2}) {
			t.Fatalf("unanswered after time-out counted as a mistake: %+v", r)
		}
	}

	perfect := Summarize([]Result{{Position: 0, TopicID: "a", Answered: true, Correct: true}}, false)
	if perfect.Correct != 1 || perfect.Review != nil {
		t.Fatalf("perfect = %+v", perfect)
	}
}
