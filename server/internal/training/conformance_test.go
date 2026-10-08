package training

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"testing"

	"github.com/daryaleushkina/greprepapp/server/internal/api"
)

// Ожидания общие с клиентами; здесь только перевод моделей договора в аргументы правил Go.
type conformanceCases struct {
	Answers []struct {
		Name      string          `json:"name"`
		Question  api.Question    `json:"question"`
		Answer    api.GivenAnswer `json:"answer"`
		Correct   bool            `json:"correct"`
		BadAnswer bool            `json:"badAnswer"`
	} `json:"answers"`
	Summaries []struct {
		Name            string              `json:"name"`
		StartedAtMillis int64               `json:"startedAtMillis"`
		Session         api.TrainingSession `json:"session"`
		Finish          api.TrainingFinish  `json:"finish"`
		Expected        api.TrainingSummary `json:"expected"`
	} `json:"summaries"`
	Pace []struct {
		Name             string      `json:"name"`
		Section          api.Section `json:"section"`
		Count            int         `json:"count"`
		PaceSeconds      int         `json:"paceSeconds"`
		TimeLimitSeconds int         `json:"timeLimitSeconds"`
	} `json:"pace"`
	// Эти правила есть только на клиентах; Go сохраняет строгий разбор оболочки файла, не проверяя их.
	Toggles       json.RawMessage `json:"toggles"`
	MissingGroups json.RawMessage `json:"missingGroups"`
	Clocks        json.RawMessage `json:"clocks"`
	Minutes       json.RawMessage `json:"minutes"`
	Repeats       json.RawMessage `json:"repeats"`
}

func TestTrainingRulesConformance(t *testing.T) {
	raw, err := os.ReadFile("../../../api/conformance/training-rules.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases conformanceCases
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&cases); err != nil {
		t.Fatal(err)
	}
	if len(cases.Answers) == 0 || len(cases.Summaries) == 0 || len(cases.Pace) == 0 {
		t.Fatal("conformance file must contain answers, summaries and pace")
	}
	t.Run("answers", func(t *testing.T) {
		for _, c := range cases.Answers {
			t.Run(c.Name, func(t *testing.T) {
				q := conformanceQuestion(t, c.Question)
				if err := c.Answer.Validate(); err != nil {
					t.Fatalf("GivenAnswer: %v", err)
				}
				got, err := CheckAnswer(q, c.Answer.OptionIds, c.Answer.DontKnow)
				if c.BadAnswer {
					if !errors.Is(err, ErrBadAnswer) {
						t.Errorf("CheckAnswer error = %v, want ErrBadAnswer", err)
					}
				} else if err != nil {
					t.Fatalf("CheckAnswer: %v", err)
				}
				if got != c.Correct {
					t.Errorf("CheckAnswer correct = %v, want %v", got, c.Correct)
				}
			})
		}
	})
	t.Run("summaries", func(t *testing.T) {
		for _, c := range cases.Summaries {
			t.Run(c.Name, func(t *testing.T) {
				// ogen проверяет всю цепочку TrainingSession → TrainingItem → GivenAnswer.
				if err := c.Session.Validate(); err != nil {
					t.Fatalf("TrainingSession: %v", err)
				}
				if err := c.Expected.Validate(); err != nil {
					t.Fatalf("TrainingSummary: %v", err)
				}
				results := make([]Result, 0, len(c.Session.Items))
				for _, item := range c.Session.Items {
					q := conformanceQuestion(t, item.Question)
					answer, _ := item.Answer.Get()
					correct, err := CheckAnswer(q, answer.OptionIds, answer.DontKnow)
					if err != nil {
						t.Fatalf("position %d: %v", item.Position, err)
					}
					results = append(results, Result{
						Position: item.Position, TopicID: item.Question.TopicId,
						Title:    Text{Ru: item.Question.TopicTitle.Ru, En: item.Question.TopicTitle.En},
						Answered: len(answer.OptionIds) > 0, DontKnow: answer.DontKnow, Correct: correct,
					})
				}
				got := Summarize(results, TimedOut(Mode(c.Session.Mode), c.Finish.TimedOut))
				want := Summary{Correct: c.Expected.Correct, Total: c.Expected.Total, Unanswered: c.Expected.Unanswered}
				for _, topic := range c.Expected.Review {
					want.Review = append(want.Review, TopicToReview{
						TopicID: topic.TopicId, Title: Text{Ru: topic.Title.Ru, En: topic.Title.En},
						Mistakes: topic.Mistakes, Positions: topic.Positions,
					})
				}
				if !reflect.DeepEqual(got, want) {
					t.Errorf("Summarize = %+v\nwant %+v", got, want)
				}
				var limit *int
				if value, ok := c.Session.TimeLimitSeconds.Get(); ok {
					limit = &value
				}
				if got := DurationSeconds(c.Session.StartedAt, c.Finish.FinishedAt, limit); got != c.Expected.DurationSeconds {
					t.Errorf("DurationSeconds = %d, want %d", got, c.Expected.DurationSeconds)
				}
			})
		}
	})
	t.Run("pace", func(t *testing.T) {
		for _, c := range cases.Pace {
			t.Run(c.Name, func(t *testing.T) {
				if err := c.Section.Validate(); err != nil {
					t.Fatal(err)
				}
				if got := PaceSeconds(Section(c.Section)); got != c.PaceSeconds {
					t.Errorf("PaceSeconds = %d, want %d", got, c.PaceSeconds)
				}
				if got := TimeLimitSeconds(Section(c.Section), c.Count); got != c.TimeLimitSeconds {
					t.Errorf("TimeLimitSeconds = %d, want %d", got, c.TimeLimitSeconds)
				}
			})
		}
	})
}

func conformanceQuestion(t *testing.T, q api.Question) Question {
	t.Helper()
	if err := q.Validate(); err != nil {
		t.Fatalf("Question contract: %v", err)
	}
	out := Question{
		Type: Type(q.QuestionType), Answer: q.Answer,
		Body: Body{
			Prompt: q.Prompt, Condition: q.Condition.Or(""), QuantityA: q.QuantityA.Or(""), QuantityB: q.QuantityB.Or(""),
			SelectCount: q.SelectCount,
		},
		Explanation: Explanation{Solution: Text{Ru: q.Explanation.Solution.Ru, En: q.Explanation.Solution.En}},
	}
	for _, group := range q.Groups {
		g := Group{}
		for _, option := range group.Options {
			g.Options = append(g.Options, Option{ID: option.ID, Text: option.Text})
		}
		out.Body.Groups = append(out.Body.Groups, g)
	}
	for _, option := range q.Explanation.Options {
		out.Explanation.Options = append(out.Explanation.Options, OptionExplanation{
			OptionID: option.OptionId, Text: Text{Ru: option.Text.Ru, En: option.Text.En},
		})
	}
	if err := Validate(out); err != nil {
		t.Fatalf("Question rules: %v", err)
	}
	return out
}
