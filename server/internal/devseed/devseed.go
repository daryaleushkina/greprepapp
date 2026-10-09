// Package devseed — набор заданий для разработки: локальный сервер, стенд, тесты (решение Даши 06.10.2026:
// набор свой и пробный, лежит в публичном git и в бой не идёт). В бой он не попадает:
// команда seed-dev отказывается работать с APP_ENV=production, а контент для людей приходит через админку
// после проверки Даши (AGENTS.md, «Контент заданий»). Задания свои, не из пособий ETS.
package devseed

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/daryaleushkina/greprepapp/server/internal/db"
	"github.com/daryaleushkina/greprepapp/server/internal/training"
)

//go:embed questions.json
var raw []byte

// Topic — тема заданий.
type Topic struct {
	ID       string        `json:"id"`
	Exam     string        `json:"exam"`
	Section  string        `json:"section"`
	Title    training.Text `json:"title"`
	Position int           `json:"position"`
}

// Question — задание набора.
type Question struct {
	ID          uuid.UUID            `json:"id"`
	Type        training.Type        `json:"type"`
	Topic       string               `json:"topic"`
	Difficulty  string               `json:"difficulty"`
	Body        training.Body        `json:"body"`
	Answer      []string             `json:"answer"`
	Explanation training.Explanation `json:"explanation"`
}

// Set — весь набор.
type Set struct {
	Topics    []Topic    `json:"topics"`
	Questions []Question `json:"questions"`
}

// Load читает встроенный набор и проверяет каждое задание теми же правилами, что и контент из админки.
func Load() (Set, error) { return parse(raw) }

func parse(data []byte) (Set, error) {
	var s Set
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&s); err != nil {
		return Set{}, fmt.Errorf("decode dev seed: %w", err)
	}
	sections := map[string]string{}
	exams := map[string]string{}
	for _, t := range s.Topics {
		sections[t.ID] = t.Section
		exams[t.ID] = t.Exam
	}
	for _, q := range s.Questions {
		if exams[q.Topic] != training.ExamOf(q.Type) || sections[q.Topic] != string(training.SectionOf(q.Type)) {
			return Set{}, fmt.Errorf("dev seed question %s: topic %q is not in the section of %s", q.ID, q.Topic, q.Type)
		}
		switch q.Difficulty {
		case "easy", "medium", "hard":
		default:
			return Set{}, fmt.Errorf("dev seed question %s: difficulty %q", q.ID, q.Difficulty)
		}
		err := training.Validate(training.Question{Type: q.Type, Body: q.Body, Answer: q.Answer, Explanation: q.Explanation})
		if err != nil {
			return Set{}, fmt.Errorf("dev seed question %s: %w", q.ID, err)
		}
	}
	return s, nil
}

// Apply записывает набор в базу одной транзакцией; повторный запуск обновляет те же задания.
func Apply(ctx context.Context, pool *pgxpool.Pool, s Set) error {
	err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		q := db.New(tx)
		for _, t := range s.Topics {
			err := q.UpsertTopic(ctx, db.UpsertTopicParams{
				ID: t.ID, ExamID: t.Exam, Section: t.Section, TitleRu: t.Title.Ru, TitleEn: t.Title.En, Position: t.Position,
			})
			if err != nil {
				return fmt.Errorf("upsert topic %s: %w", t.ID, err)
			}
		}
		for _, item := range s.Questions {
			body, err := json.Marshal(item.Body)
			if err != nil {
				return fmt.Errorf("encode body %s: %w", item.ID, err)
			}
			expl, err := json.Marshal(item.Explanation)
			if err != nil {
				return fmt.Errorf("encode explanation %s: %w", item.ID, err)
			}
			err = q.UpsertQuestion(ctx, db.UpsertQuestionParams{
				ID: item.ID, QuestionType: string(item.Type), TopicID: item.Topic, Difficulty: item.Difficulty,
				Status: "approved", Body: body, Answer: item.Answer, Explanation: expl,
			})
			if err != nil {
				return fmt.Errorf("upsert question %s: %w", item.ID, err)
			}
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("apply dev seed: %w", err)
	}
	return nil
}
