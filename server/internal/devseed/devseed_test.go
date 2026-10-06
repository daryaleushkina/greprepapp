package devseed

import (
	"testing"

	"github.com/daryaleushkina/greprepapp/server/internal/training"
)

// Набор проходит те же правила, что контент из админки, и покрывает каждый тип первого среза.
func TestLoad(t *testing.T) {
	s, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	perType := map[training.Type]int{}
	for _, q := range s.Questions {
		perType[q.Type]++
	}
	for _, typ := range training.Types {
		if perType[typ] < 5 {
			t.Errorf("%s: %d questions, want at least 5", typ, perType[typ])
		}
	}
	if len(s.Topics) == 0 {
		t.Fatal("no topics")
	}
}

func TestParseRejects(t *testing.T) {
	topic := `{"id":"t","section":"verbal","title":{"ru":"т","en":"t"},"position":0}`
	why := `{"ru":"р","en":"s"}`
	question := func(typ, diff string) string {
		return `{"id":"d3f00000-0000-4000-8000-000000000001","type":"` + typ + `","topic":"t","difficulty":"` + diff + `",
			"body":{"prompt":"A ___.","groups":[{"options":[{"id":"A","text":"a"},{"id":"B","text":"b"},{"id":"C","text":"c"},{"id":"D","text":"d"},{"id":"E","text":"e"}]}],"selectCount":1},
			"answer":["A"],"explanation":{"solution":` + why + `,"options":[
			{"optionId":"B","text":` + why + `},{"optionId":"C","text":` + why + `},
			{"optionId":"D","text":` + why + `},{"optionId":"E","text":` + why + `}]}}`
	}
	set := func(q string) []byte { return []byte(`{"topics":[` + topic + `],"questions":[` + q + `]}`) }
	if _, err := parse(set(question("text_completion", "easy"))); err != nil {
		t.Fatalf("valid set rejected: %v", err)
	}
	cases := map[string][]byte{
		"unknown field":         []byte(`{"topics":[],"questions":[],"extra":1}`),
		"type outside section":  set(question("multiple_choice", "easy")),
		"unknown difficulty":    set(question("text_completion", "brutal")),
		"invalid question body": set(question("sentence_equivalence", "easy")),
	}
	for name, data := range cases {
		if _, err := parse(data); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}
