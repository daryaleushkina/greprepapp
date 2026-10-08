// Package training — правила тренировок без базы: как собрано задание каждого типа, как проверяется ответ,
// сколько времени у «Проверки», что попадает в «Что повторить». Обработчики (internal/service) только
// читают и пишут базу вокруг этих правил.
package training

import (
	"cmp"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

// Type — тип задания первого среза (решение Даши 06.10.2026).
type Type string

const (
	TextCompletion         Type = "text_completion"
	SentenceEquivalence    Type = "sentence_equivalence"
	QuantitativeComparison Type = "quantitative_comparison"
	MultipleChoice         Type = "multiple_choice"
)

// Section — раздел экзамена, в котором бывают тренировки.
type Section string

const (
	Verbal Section = "verbal"
	Quant  Section = "quant"
)

// Mode — «Практика» или «Проверка».
type Mode string

const (
	Practice Mode = "practice"
	Check    Mode = "check"
)

// Types — все типы первого среза в порядке конструктора.
var Types = []Type{TextCompletion, SentenceEquivalence, QuantitativeComparison, MultipleChoice}

// SectionOf — раздел типа задания; пусто — тип неизвестен.
func SectionOf(t Type) Section {
	switch t {
	case TextCompletion, SentenceEquivalence:
		return Verbal
	case QuantitativeComparison, MultipleChoice:
		return Quant
	default:
		return ""
	}
}

// PaceSeconds — темп экзамена на вопрос: Verbal 12 вопросов за 18 минут, Quant 12 за 21 (вторые секции —
// 15 за 23 и 26, тот же темп). Это и время «Проверки», и оценка «~12 мин» на кнопке «Начать».
func PaceSeconds(s Section) int {
	if s == Quant {
		return 105
	}
	return 90
}

// TimeLimitSeconds — время «Проверки» на n вопросов.
func TimeLimitSeconds(s Section, n int) int { return PaceSeconds(s) * n }

// TimedOut учитывает сигнал конца таймера только у «Проверки»: у «Практики» таймера нет.
func TimedOut(mode Mode, requested bool) bool { return requested && mode == Check }

// DurationSeconds — целые секунды от начала до конца, не больше лимита, если он есть.
// Обработчик заранее ограничивает дату конца началом и временем получения запроса.
func DurationSeconds(startedAt, finishedAt time.Time, timeLimitSeconds *int) int {
	duration := finishedAt.Sub(startedAt)
	if timeLimitSeconds != nil {
		duration = min(duration, time.Duration(*timeLimitSeconds)*time.Second)
	}
	return int(duration / time.Second)
}

// MaxQuestions — больше вопросов в одной тренировке не бывает (TrainingRequest.count в договоре).
const MaxQuestions = 50

// TimedCount — вопросов в «Проверке на время»: как в первой секции экзамена.
const TimedCount = 12

// Blank — пропуск в тексте Text Completion и Sentence Equivalence.
const Blank = "___"

// Text — строка на двух языках интерфейса.
type Text struct {
	Ru string `json:"ru"`
	En string `json:"en"`
}

// Option — вариант ответа.
type Option struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// Group — варианты одного пропуска Text Completion; у остальных типов группа одна.
type Group struct {
	Options []Option `json:"options"`
}

// Body — условие задания; хранится в questions.body.
type Body struct {
	Prompt      string  `json:"prompt"`
	Condition   string  `json:"condition,omitempty"`
	QuantityA   string  `json:"quantityA,omitempty"`
	QuantityB   string  `json:"quantityB,omitempty"`
	Groups      []Group `json:"groups"`
	SelectCount int     `json:"selectCount"`
}

// OptionExplanation — «Почему не …?»: чем соблазняет неверный вариант и чем плох.
type OptionExplanation struct {
	OptionID string `json:"optionId"`
	Text     Text   `json:"text"`
}

// Explanation — разбор; хранится в questions.explanation.
type Explanation struct {
	Solution Text                `json:"solution"`
	Options  []OptionExplanation `json:"options"`
}

// Question — задание целиком.
type Question struct {
	Type        Type
	Body        Body
	Answer      []string
	Explanation Explanation
}

// Пределы — те же, что в договоре (api/openapi.yaml, Question): задание, которое договор не пропустит, не
// должно попасть в базу.
const (
	maxPrompt   = 4000
	maxSide     = 500
	maxOptionID = 16
	maxOption   = 500
)

// ErrInvalid — задание собрано неверно; подробность — в обёртке.
var ErrInvalid = errors.New("invalid question")

func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, args...))
}

// Validate проверяет, что задание собрано по правилам своего типа, ключ указывает на варианты и каждый
// неверный вариант разобран (PRODUCT.md, «Разбор ошибок»).
func Validate(q Question) error {
	b := q.Body
	if b.Prompt == "" || utf8.RuneCountInString(b.Prompt) > maxPrompt {
		return invalid("prompt must be 1..%d characters", maxPrompt)
	}
	for _, s := range []string{b.Condition, b.QuantityA, b.QuantityB} {
		if utf8.RuneCountInString(s) > maxSide {
			return invalid("condition and quantities must be at most %d characters", maxSide)
		}
	}
	if err := validateShape(q); err != nil {
		return err
	}
	ids := map[string]int{} // вариант → номер группы
	for gi, g := range b.Groups {
		for _, o := range g.Options {
			if o.ID == "" || len(o.ID) > maxOptionID {
				return invalid("option id must be 1..%d bytes", maxOptionID)
			}
			if o.Text == "" || utf8.RuneCountInString(o.Text) > maxOption {
				return invalid("option %s text must be 1..%d characters", o.ID, maxOption)
			}
			if _, dup := ids[o.ID]; dup {
				return invalid("option id %s repeats", o.ID)
			}
			ids[o.ID] = gi
		}
	}
	if err := validateAnswer(q, ids); err != nil {
		return err
	}
	return validateExplanation(q, ids)
}

// validateShape — число пропусков, групп, вариантов и ответов по типу, как в GRE.
func validateShape(q Question) error {
	b := q.Body
	blanks := strings.Count(b.Prompt, Blank)
	sizes := make([]int, len(b.Groups))
	for i, g := range b.Groups {
		sizes[i] = len(g.Options)
	}
	switch q.Type {
	case TextCompletion:
		// Один пропуск — пять вариантов; два-три пропуска — по три на каждый.
		ok := slices.Equal(sizes, []int{5}) || slices.Equal(sizes, []int{3, 3}) || slices.Equal(sizes, []int{3, 3, 3})
		if !ok || blanks != len(sizes) || b.SelectCount != 1 {
			return invalid("text completion needs 1 blank with 5 options or 2-3 blanks with 3 options each")
		}
	case SentenceEquivalence:
		if !slices.Equal(sizes, []int{6}) || blanks != 1 || b.SelectCount != 2 {
			return invalid("sentence equivalence needs 1 blank, 6 options, 2 answers")
		}
	case QuantitativeComparison:
		if !slices.Equal(sizes, []int{4}) || b.SelectCount != 1 || b.QuantityA == "" || b.QuantityB == "" {
			return invalid("quantitative comparison needs quantities A and B and 4 options")
		}
	case MultipleChoice:
		if !slices.Equal(sizes, []int{5}) || b.SelectCount != 1 {
			return invalid("multiple choice needs 5 options and 1 answer")
		}
	default:
		return invalid("unknown question type %q", q.Type)
	}
	return nil
}

// validateAnswer — в каждой группе ровно selectCount верных.
func validateAnswer(q Question, ids map[string]int) error {
	perGroup := make([]int, len(q.Body.Groups))
	seen := map[string]bool{}
	for _, id := range q.Answer {
		g, ok := ids[id]
		if !ok || seen[id] {
			return invalid("answer %q is not a distinct option", id)
		}
		seen[id] = true
		perGroup[g]++
	}
	for g, n := range perGroup {
		if n != q.Body.SelectCount {
			return invalid("group %d has %d answers, want %d", g+1, n, q.Body.SelectCount)
		}
	}
	return nil
}

// validateExplanation — разбор на обоих языках, и у каждого неверного варианта своё «Почему не».
func validateExplanation(q Question, ids map[string]int) error {
	e := q.Explanation
	if e.Solution.Ru == "" || e.Solution.En == "" {
		return invalid("solution must be in Russian and English")
	}
	explained := map[string]bool{}
	for _, o := range e.Options {
		if _, ok := ids[o.OptionID]; !ok || slices.Contains(q.Answer, o.OptionID) || explained[o.OptionID] {
			return invalid("explanation for %q is not for a distinct wrong option", o.OptionID)
		}
		if o.Text.Ru == "" || o.Text.En == "" {
			return invalid("explanation for %s must be in Russian and English", o.OptionID)
		}
		explained[o.OptionID] = true
	}
	if want := len(ids) - len(q.Answer); len(explained) != want {
		return invalid("%d of %d wrong options are explained", len(explained), want)
	}
	return nil
}

// ErrBadAnswer — ответ не подходит к заданию (чужой вариант, лишний выбор, «Не знаю» с выбором).
var ErrBadAnswer = errors.New("answer does not fit the question")

// CheckAnswer проверяет, что ответ собран из вариантов задания, и говорит, верен ли он. Пустой ответ —
// «не ответил»: correct=false, ошибки нет. Верен только полный ответ: в Text Completion с тремя пропусками
// и в Sentence Equivalence балл, как в GRE, — лишь за все верные части.
func CheckAnswer(q Question, optionIDs []string, dontKnow bool) (correct bool, err error) {
	if dontKnow && len(optionIDs) > 0 {
		return false, fmt.Errorf("%w: dont know with chosen options", ErrBadAnswer)
	}
	group := map[string]int{}
	for gi, g := range q.Body.Groups {
		for _, o := range g.Options {
			group[o.ID] = gi
		}
	}
	perGroup := make([]int, len(q.Body.Groups))
	seen := map[string]bool{}
	for _, id := range optionIDs {
		g, ok := group[id]
		if !ok || seen[id] {
			return false, fmt.Errorf("%w: option %q", ErrBadAnswer, id)
		}
		seen[id] = true
		perGroup[g]++
		if perGroup[g] > q.Body.SelectCount {
			return false, fmt.Errorf("%w: too many options in group %d", ErrBadAnswer, g+1)
		}
	}
	if len(optionIDs) != len(q.Answer) {
		return false, nil
	}
	for _, id := range q.Answer {
		if !seen[id] {
			return false, nil
		}
	}
	return true, nil
}

// Result — вопрос сессии после ответов: всё, что нужно для итога.
type Result struct {
	Position int
	TopicID  string
	Title    Text
	Answered bool // выбран хоть один вариант
	DontKnow bool
	Correct  bool
}

// TopicToReview — тема из «Что повторить» (макет R15).
type TopicToReview struct {
	TopicID   string
	Title     Text
	Mistakes  int
	Positions []int
}

// Summary — итог тренировки.
type Summary struct {
	Correct    int
	Total      int
	Unanswered int
	Review     []TopicToReview
}

// MaxReview — сколько тем в «Что повторить» (PRODUCT.md: 1–3 темы).
const MaxReview = 3

// Summarize считает итог. Ошибка для «Что повторить» — неверный ответ, «Не знаю» и пропуск. Когда время
// «Проверки» вышло, неотвеченное — «не успел»: это не ошибка темы (решение Даши 06.10.2026).
func Summarize(results []Result, timedOut bool) Summary {
	s := Summary{Total: len(results)}
	byTopic := map[string]*TopicToReview{}
	var order []*TopicToReview
	for _, r := range results {
		if r.Correct {
			s.Correct++
			continue
		}
		if !r.Answered {
			s.Unanswered++
			if timedOut && !r.DontKnow {
				continue
			}
		}
		t := byTopic[r.TopicID]
		if t == nil {
			t = &TopicToReview{TopicID: r.TopicID, Title: r.Title}
			byTopic[r.TopicID] = t
			order = append(order, t)
		}
		t.Mistakes++
		t.Positions = append(t.Positions, r.Position)
	}
	// Больше ошибок — выше; поровну — какая встретилась раньше.
	slices.SortStableFunc(order, func(a, b *TopicToReview) int {
		if c := cmp.Compare(b.Mistakes, a.Mistakes); c != 0 {
			return c
		}
		return cmp.Compare(a.Positions[0], b.Positions[0])
	})
	for _, t := range order[:min(len(order), MaxReview)] {
		s.Review = append(s.Review, *t)
	}
	return s
}
