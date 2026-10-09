package service

import (
	"context"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/daryaleushkina/greprepapp/server/internal/api"
	"github.com/daryaleushkina/greprepapp/server/internal/db"
	"github.com/daryaleushkina/greprepapp/server/internal/devseed"
	"github.com/daryaleushkina/greprepapp/server/internal/testdb"
)

type queryCounter struct {
	mu    sync.Mutex
	count int
}

func (c *queryCounter) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	switch strings.ToLower(data.SQL) {
	case "begin", "commit", "rollback":
		return ctx
	}
	c.mu.Lock()
	c.count++
	c.mu.Unlock()
	return ctx
}
func (*queryCounter) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}
func (c *queryCounter) reset() {
	c.mu.Lock()
	c.count = 0
	c.mu.Unlock()
}

func (c *queryCounter) total() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.count
}

func TestExamQueriesAndCapabilities(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	original := testdb.New(t)
	q := db.New(original)
	u, err := q.CreateUser(ctx, db.CreateUserParams{Name: "Fixture", Role: "user", Locale: "ru"})
	if err != nil {
		t.Fatal(err)
	}
	seed, err := devseed.Load()
	if err != nil {
		t.Fatal(err)
	}
	if err := devseed.Apply(ctx, original, seed); err != nil {
		t.Fatal(err)
	}
	counter := &queryCounter{}
	cfg := original.Config()
	cfg.ConnConfig.Tracer = counter
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	s := &Service{pool: pool, q: db.New(pool), now: time.Now, log: slog.New(slog.DiscardHandler)}
	ctx = context.WithValue(ctx, principalKey{}, principal{user: u})
	// Пока все значения enum относятся к GRE; техническая фикстура моделирует возможности будущего клиента.
	options, err := s.GetTrainingOptions(ctx, api.GetTrainingOptionsParams{Exam: api.ExamGre, Types: []api.QuestionType{api.QuestionTypeTextCompletion, api.QuestionType("future_toefl_type")}})
	if err != nil {
		t.Error(err)
	} else if len(options.Types) != 1 || options.Types[0].QuestionType != api.QuestionTypeTextCompletion {
		t.Fatalf("foreign capability returned: %+v", options.Types)
	}
	counter.reset()
	if _, err := s.GetTrainingOptions(ctx, api.GetTrainingOptionsParams{Exam: api.ExamGre, Types: []api.QuestionType{api.QuestionTypeTextCompletion}}); err != nil {
		t.Fatal(err)
	}
	if got := counter.total(); got != 2 {
		t.Errorf("options: %d queries, want 2", got)
	}
	counter.reset()
	_, err = s.StartTraining(ctx, &api.TrainingRequest{Exam: api.ExamGre, Section: api.SectionVerbal, QuestionTypes: []api.QuestionType{api.QuestionTypeTextCompletion}, Count: 1, Mode: api.TrainingModePractice})
	if err != nil {
		t.Fatal(err)
	}
	if got := counter.total(); got != 5 {
		t.Errorf("start: %d queries, want 5", got)
	}
	counter.reset()
	user, err := s.SetActiveExam(ctx, &api.ExamChoice{Exam: api.ExamToefl})
	if err != nil {
		t.Fatal(err)
	}
	if user.ActiveExam.Or("") != api.ActiveExamToefl {
		t.Fatalf("choice = %+v", user)
	}
	if got := counter.total(); got != 2 {
		t.Errorf("choice: %d queries, want 2", got)
	}
}
