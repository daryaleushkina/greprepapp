// Package today — лента шагов на сегодня (экран «Сегодня»). В каркасе план постоянный: три шага, первый
// текущий. Настоящий план (по прогрессу, ошибкам и «что повторить») придёт с фичами тренировок и словаря.
package today

import "time"

// Step — шаг ленты.
type Step struct {
	ID      string
	Section string // verbal, quant, words, essay
	Title   string
	Minutes int
	State   string // done, current, next
}

// Plan — шаги дня по порядку. Конец ленты виден: шагов мало и их число известно сразу.
type Plan struct {
	Date  time.Time
	Steps []Step
}

type template struct {
	id, section string
	minutes     int
	title       map[string]string
}

// Название — само дело, без раздела: раздел клиент пишет строкой ниже (макет T1: «Text Completion» и под ним
// «Verbal»), иначе он повторялся бы дважды. Типы заданий GRE — по-английски и в русском интерфейсе.
var starter = []template{
	{"words", "words", 5, map[string]string{"ru": "Повторение", "en": "Review"}},
	{"verbal", "verbal", 10, map[string]string{"ru": "Text Completion", "en": "Text Completion"}},
	{"quant", "quant", 10, map[string]string{"ru": "Quantitative Comparison", "en": "Quantitative Comparison"}},
}

// ForNewUser — план для того, кто ещё ничего не решал. Дата — в UTC: часовой пояс человека появится
// вместе с настоящим планом дня.
func ForNewUser(now time.Time, locale string) Plan {
	if locale != "en" {
		locale = "ru"
	}
	steps := make([]Step, 0, len(starter))
	for i, t := range starter {
		state := "next"
		if i == 0 {
			state = "current"
		}
		steps = append(steps, Step{ID: t.id, Section: t.section, Title: t.title[locale], Minutes: t.minutes, State: state})
	}
	y, m, d := now.UTC().Date()
	return Plan{Date: time.Date(y, m, d, 0, 0, 0, 0, time.UTC), Steps: steps}
}
