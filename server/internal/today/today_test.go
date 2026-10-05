package today

import (
	"testing"
	"time"
)

func TestForNewUser(t *testing.T) {
	t.Parallel()
	// 23:30 по Москве 6 октября — это 20:30 UTC: дата плана — 6 октября (UTC).
	now := time.Date(2026, 10, 6, 23, 30, 0, 0, time.FixedZone("MSK", 3*3600))
	p := ForNewUser(now, "ru")
	if !p.Date.Equal(time.Date(2026, 10, 6, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("date = %v", p.Date)
	}
	if len(p.Steps) != 3 {
		t.Fatalf("steps = %d, want 3", len(p.Steps))
	}
	current := 0
	for i, s := range p.Steps {
		if s.State == "current" {
			current++
			if i != 0 {
				t.Errorf("current step is #%d, want the first", i)
			}
		}
		if s.Title == "" || s.Minutes <= 0 {
			t.Errorf("step %d incomplete: %+v", i, s)
		}
	}
	if current != 1 {
		t.Fatalf("current steps = %d, want exactly 1", current)
	}
	if p.Steps[0].Title != "Слова: повторение" {
		t.Fatalf("ru title = %q", p.Steps[0].Title)
	}
}

func TestLocaleFallback(t *testing.T) {
	t.Parallel()
	if got := ForNewUser(time.Now(), "en").Steps[0].Title; got != "Words: review" {
		t.Fatalf("en title = %q", got)
	}
	if got := ForNewUser(time.Now(), "de").Steps[0].Title; got != "Слова: повторение" {
		t.Fatalf("unknown locale title = %q, want Russian", got)
	}
}
