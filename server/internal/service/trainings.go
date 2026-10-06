package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/daryaleushkina/greprepapp/server/internal/api"
	"github.com/daryaleushkina/greprepapp/server/internal/apperr"
	"github.com/daryaleushkina/greprepapp/server/internal/db"
	"github.com/daryaleushkina/greprepapp/server/internal/httpx"
	"github.com/daryaleushkina/greprepapp/server/internal/training"
)

// canTrain — можно ли человеку открывать тренировки. Платный контент не покидает сервер без проверки прав
// (CLAUDE.md); пока идёт бета, тренировки открыты всем вошедшим (решение Даши 06.10.2026). Проверка
// подписки встанет сюда, а не в каждый обработчик. Незнакомая роль — отказ: новая роль не получает доступ
// молча.
func canTrain(u db.User) bool {
	return u.Role == string(api.RoleUser) || u.Role == string(api.RoleAdmin)
}

func (s *Service) trainee(ctx context.Context) (principal, error) {
	p, err := principalFrom(ctx)
	if err != nil {
		return principal{}, err
	}
	if !canTrain(p.user) {
		return principal{}, apperr.Denied("trainings are not available")
	}
	return p, nil
}

// Виды готовых наборов. В договоре это открытая строка: клиент пропускает незнакомые виды.
const (
	presetLast  = "last"
	presetTimed = "timed"
)

// GetTrainingOptions — темы с числом заданий и готовые наборы для конструктора. Только типы, которые клиент
// умеет показывать: тип, добавленный на сервере позже, не ломает уже установленные версии.
func (s *Service) GetTrainingOptions(ctx context.Context, params api.GetTrainingOptionsParams) (*api.TrainingOptions, error) {
	p, err := s.trainee(ctx)
	if err != nil {
		return nil, err
	}
	qctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()
	rows, err := s.q.CountApprovedQuestions(qctx)
	if err != nil {
		return nil, fmt.Errorf("count questions: %w", err)
	}
	types := trainingTypes(rows, params.Types)

	presets := []api.TrainingPreset{}
	last, hasLast, err := s.lastRequest(qctx, p.user.ID)
	if errors.Is(err, errUnreadableRequest) {
		// Старый формат запроса после правки договора не должен закрывать конструктор насовсем: набор «Как в
		// прошлый раз» пропадает, сбой — в журнал.
		s.log.LogAttrs(ctx, slog.LevelError, "last training request",
			slog.String("request_id", httpx.FromContext(ctx).ID), slog.String("error", err.Error()))
	} else if err != nil {
		return nil, err
	}
	timedSection := api.SectionVerbal
	if hasLast && supportsAll(params.Types, last.QuestionTypes) {
		presets = append(presets, api.TrainingPreset{Kind: presetLast, Request: last})
		timedSection = last.Section
	}
	if timed, ok := timedPreset(types, timedSection); ok {
		presets = append(presets, timed)
	}
	return &api.TrainingOptions{Types: types, Presets: presets, MaxQuestions: training.MaxQuestions}, nil
}

func supportsAll(supported, types []api.QuestionType) bool {
	for _, t := range types {
		if !slices.Contains(supported, t) {
			return false
		}
	}
	return true
}

// trainingTypes — все поддержанные клиентом типы, даже пустые: конструктор показывает их с пометкой «скоро».
func trainingTypes(rows []db.CountApprovedQuestionsRow, supported []api.QuestionType) []api.TrainingType {
	types := make([]api.TrainingType, 0, len(training.Types))
	index := map[training.Type]int{}
	for _, t := range training.Types {
		if !slices.Contains(supported, api.QuestionType(t)) {
			continue
		}
		index[t] = len(types)
		sec := training.SectionOf(t)
		types = append(types, api.TrainingType{
			Section:      api.Section(sec),
			QuestionType: api.QuestionType(t),
			PaceSeconds:  training.PaceSeconds(sec),
			Topics:       []api.TrainingTopic{},
		})
	}
	for _, r := range rows {
		i, ok := index[training.Type(r.QuestionType)]
		if !ok {
			continue
		}
		topics := types[i].Topics
		if n := len(topics); n == 0 || topics[n-1].ID != r.TopicID {
			topics = append(topics, api.TrainingTopic{ID: r.TopicID, Title: api.LocalizedText{Ru: r.TitleRu, En: r.TitleEn}})
		}
		counts := &topics[len(topics)-1].Available
		switch r.Difficulty {
		case "easy":
			counts.Easy = r.Available
		case "medium":
			counts.Medium = r.Available
		case "hard":
			counts.Hard = r.Available
		}
		types[i].Topics = topics
	}
	return types
}

// timedPreset — «Проверка на время»: все типы раздела, где есть задания, как первая секция экзамена.
func timedPreset(types []api.TrainingType, section api.Section) (api.TrainingPreset, bool) {
	var qt []api.QuestionType
	for _, t := range types {
		if t.Section == section && len(t.Topics) > 0 {
			qt = append(qt, t.QuestionType)
		}
	}
	if qt == nil {
		return api.TrainingPreset{}, false
	}
	return api.TrainingPreset{Kind: presetTimed, Request: api.TrainingRequest{
		Section: section, QuestionTypes: qt, TopicIds: []string{}, Count: training.TimedCount, Mode: api.TrainingModeCheck,
	}}, true
}

// lastRequest — запрос прошлой тренировки для «Как в прошлый раз»; ok=false — тренировок ещё не было.
func (s *Service) lastRequest(ctx context.Context, userID uuid.UUID) (r api.TrainingRequest, ok bool, err error) {
	raw, err := s.q.GetLastTrainingRequest(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return r, false, nil
	}
	if err != nil {
		return r, false, fmt.Errorf("last training request: %w", err)
	}
	if err := r.UnmarshalJSON(raw); err != nil {
		return r, false, fmt.Errorf("%w: %w", errUnreadableRequest, err)
	}
	return r, true, nil
}

// errUnreadableRequest — сохранённый запрос прошлой тренировки не разбирается по нынешнему договору.
var errUnreadableRequest = errors.New("decode last training request")

// StartTraining подбирает задания и отдаёт сессию целиком, чтобы она дожила без сети.
func (s *Service) StartTraining(ctx context.Context, req *api.TrainingRequest) (*api.TrainingSession, error) {
	p, err := s.trainee(ctx)
	if err != nil {
		return nil, err
	}
	if req.Section != api.SectionVerbal && req.Section != api.SectionQuant {
		return nil, apperr.Invalid("trainings exist only for verbal and quant", nil)
	}
	types := make([]string, 0, len(req.QuestionTypes))
	for _, t := range req.QuestionTypes {
		if string(training.SectionOf(training.Type(t))) != string(req.Section) {
			return nil, apperr.Invalid(fmt.Sprintf("question type %s is not in section %s", t, req.Section), nil)
		}
		types = append(types, string(t))
	}
	request, err := req.MarshalJSON()
	if err != nil {
		return nil, fmt.Errorf("encode training request: %w", err)
	}
	var difficulty *string
	if d, ok := req.Difficulty.Get(); ok {
		v := string(d)
		difficulty = &v
	}
	topicIDs := req.TopicIds
	if topicIDs == nil {
		topicIDs = []string{}
	}

	tctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()
	var session *api.TrainingSession
	err = pgx.BeginFunc(tctx, s.pool, func(tx pgx.Tx) error {
		q := s.q.WithTx(tx)
		ids, err := q.PickQuestions(tctx, db.PickQuestionsParams{
			Section: string(req.Section), QuestionTypes: types, TopicIds: topicIDs, Difficulty: difficulty,
			UserID: p.user.ID, MaxCount: req.Count,
		})
		if err != nil {
			return fmt.Errorf("pick questions: %w", err)
		}
		if len(ids) == 0 {
			return apperr.New(http.StatusConflict, apperr.NoQuestions, "no approved questions match", nil)
		}
		var limit *int
		if req.Mode == api.TrainingModeCheck {
			v := training.TimeLimitSeconds(training.Section(req.Section), len(ids))
			limit = &v
		}
		tr, err := q.CreateTraining(tctx, db.CreateTrainingParams{
			UserID: p.user.ID, Mode: string(req.Mode), Section: string(req.Section), QuestionTypes: types,
			Request: request, TimeLimitSeconds: limit, StartedAt: s.now(),
		})
		if err != nil {
			return fmt.Errorf("create training: %w", err)
		}
		if err := q.CreateTrainingItems(tctx, db.CreateTrainingItemsParams{TrainingID: tr.ID, QuestionIds: ids}); err != nil {
			return fmt.Errorf("create training items: %w", err)
		}
		rows, err := q.ListTrainingItems(tctx, tr.ID)
		if err != nil {
			return fmt.Errorf("list training items: %w", err)
		}
		session, err = sessionOf(tr, rows)
		return err
	})
	if err != nil {
		return nil, fmt.Errorf("start training: %w", err)
	}
	return session, nil
}

// GetTraining — своя тренировка с ответами, которые уже дошли.
func (s *Service) GetTraining(ctx context.Context, params api.GetTrainingParams) (*api.TrainingSession, error) {
	p, err := s.trainee(ctx)
	if err != nil {
		return nil, err
	}
	qctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()
	tr, err := s.q.GetTraining(qctx, db.GetTrainingParams{ID: params.TrainingId, UserID: p.user.ID})
	if err != nil {
		return nil, trainingLookupError(err)
	}
	rows, err := s.q.ListTrainingItems(qctx, tr.ID)
	if err != nil {
		return nil, fmt.Errorf("list training items: %w", err)
	}
	return sessionOf(tr, rows)
}

// trainingLookupError — чужая тренировка неотличима от несуществующей.
func trainingLookupError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.New(http.StatusNotFound, apperr.NotFound, "training not found", nil)
	}
	return fmt.Errorf("get training: %w", err)
}

// SubmitTrainingAnswers записывает ответы из очереди устройства; верность считает сервер.
func (s *Service) SubmitTrainingAnswers(ctx context.Context, req *api.AnswerBatch, params api.SubmitTrainingAnswersParams) error {
	p, err := s.trainee(ctx)
	if err != nil {
		return err
	}
	tctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()
	err = pgx.BeginFunc(tctx, s.pool, func(tx pgx.Tx) error {
		q := s.q.WithTx(tx)
		tr, err := q.LockTraining(tctx, db.LockTrainingParams{ID: params.TrainingId, UserID: p.user.ID})
		if err != nil {
			return trainingLookupError(err)
		}
		if tr.FinishedAt != nil {
			return apperr.New(http.StatusConflict, apperr.TrainingFinished, "training is finished", nil)
		}
		rows, err := q.ListTrainingItems(tctx, tr.ID)
		if err != nil {
			return fmt.Errorf("list training items: %w", err)
		}
		for _, a := range req.Answers {
			if a.Position >= len(rows) {
				return apperr.Invalid(fmt.Sprintf("position %d is outside the training", a.Position), nil)
			}
			question, err := questionOf(rows[a.Position])
			if err != nil {
				return err
			}
			correct, err := training.CheckAnswer(question, a.OptionIds, a.DontKnow)
			if err != nil {
				return apperr.Invalid(fmt.Sprintf("answer at position %d", a.Position), err)
			}
			ids := a.OptionIds
			if ids == nil {
				ids = []string{}
			}
			// Время ответа — по часам устройства (отвечали без сети), но не раньше начала и не позже, чем ответ
			// дошёл: иначе ответ из «будущего» навсегда закрыл бы вопрос для следующих ответов «Проверки».
			answeredAt := clampTime(a.AnsweredAt, tr.StartedAt, s.now())
			_, err = q.SaveTrainingAnswer(tctx, db.SaveTrainingAnswerParams{
				OptionIds: ids, DontKnow: a.DontKnow, Flagged: a.Flagged, AnsweredAt: &answeredAt,
				ElapsedMs: &a.ElapsedMs, Correct: &correct, TrainingID: tr.ID, Position: a.Position,
				KeepFirst: tr.Mode == string(api.TrainingModePractice),
			})
			if err != nil {
				return fmt.Errorf("save answer: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("submit answers: %w", err)
	}
	return nil
}

// FinishTraining закрывает тренировку и считает итог; повторный вызов отдаёт тот же итог.
func (s *Service) FinishTraining(ctx context.Context, req *api.TrainingFinish, params api.FinishTrainingParams) (*api.TrainingSummary, error) {
	p, err := s.trainee(ctx)
	if err != nil {
		return nil, err
	}
	tctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()
	var summary *api.TrainingSummary
	err = pgx.BeginFunc(tctx, s.pool, func(tx pgx.Tx) error {
		q := s.q.WithTx(tx)
		tr, err := q.LockTraining(tctx, db.LockTrainingParams{ID: params.TrainingId, UserID: p.user.ID})
		if err != nil {
			return trainingLookupError(err)
		}
		if tr.FinishedAt == nil {
			// Конец — по часам устройства (тренировку могли закончить без сети), но не раньше начала и не
			// позже, чем запрос дошёл: часы устройства могут врать.
			end := clampTime(req.FinishedAt, tr.StartedAt, s.now())
			// Таймер есть только у «Проверки».
			timedOut := req.TimedOut && tr.Mode == string(api.TrainingModeCheck)
			if err := q.FinishTraining(tctx, db.FinishTrainingParams{ID: tr.ID, FinishedAt: &end, TimedOut: timedOut}); err != nil {
				return fmt.Errorf("finish training: %w", err)
			}
			tr.FinishedAt, tr.TimedOut = &end, timedOut
		}
		rows, err := q.ListTrainingItems(tctx, tr.ID)
		if err != nil {
			return fmt.Errorf("list training items: %w", err)
		}
		summary = summaryOf(tr, rows)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("finish training: %w", err)
	}
	return summary, nil
}

func clampTime(t, lo, hi time.Time) time.Time {
	if t.Before(lo) {
		return lo
	}
	if t.After(hi) {
		return hi
	}
	return t
}

func summaryOf(tr db.Training, rows []db.ListTrainingItemsRow) *api.TrainingSummary {
	results := make([]training.Result, 0, len(rows))
	for _, r := range rows {
		results = append(results, training.Result{
			Position: r.Position,
			TopicID:  r.TopicID,
			Title:    training.Text{Ru: r.TitleRu, En: r.TitleEn},
			Answered: len(r.OptionIds) > 0,
			DontKnow: r.DontKnow,
			Correct:  r.Correct != nil && *r.Correct,
		})
	}
	sum := training.Summarize(results, tr.TimedOut)
	duration := tr.FinishedAt.Sub(tr.StartedAt)
	if tr.TimeLimitSeconds != nil {
		duration = min(duration, time.Duration(*tr.TimeLimitSeconds)*time.Second)
	}
	review := make([]api.TopicToReview, 0, len(sum.Review))
	for _, t := range sum.Review {
		review = append(review, api.TopicToReview{
			TopicId: t.TopicID, Title: api.LocalizedText{Ru: t.Title.Ru, En: t.Title.En}, Mistakes: t.Mistakes, Positions: t.Positions,
		})
	}
	return &api.TrainingSummary{
		Correct: sum.Correct, Total: sum.Total, Unanswered: sum.Unanswered,
		DurationSeconds: int(duration / time.Second), Review: review,
	}
}

// ReportQuestion — «Сообщить об ошибке» в задании.
func (s *Service) ReportQuestion(ctx context.Context, req *api.QuestionReport, params api.ReportQuestionParams) error {
	p, err := s.trainee(ctx)
	if err != nil {
		return err
	}
	qctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()
	var trainingID *uuid.UUID
	if id, ok := req.TrainingId.Get(); ok {
		if _, err := s.q.GetTraining(qctx, db.GetTrainingParams{ID: id, UserID: p.user.ID}); err != nil {
			return trainingLookupError(err)
		}
		// Привязка к тренировке — только если задание из неё: иначе в админке была бы ложная подсказка.
		in, err := s.q.TrainingHasQuestion(qctx, db.TrainingHasQuestionParams{TrainingID: id, QuestionID: params.QuestionId})
		if err != nil {
			return fmt.Errorf("check training question: %w", err)
		}
		if !in {
			return apperr.New(http.StatusNotFound, apperr.NotFound, "question is not in the training", nil)
		}
		trainingID = &id
	}
	ok, err := s.q.QuestionReportable(qctx, db.QuestionReportableParams{QuestionID: params.QuestionId, UserID: p.user.ID})
	if err != nil {
		return fmt.Errorf("check question: %w", err)
	}
	if !ok {
		return apperr.New(http.StatusNotFound, apperr.NotFound, "question not found", nil)
	}
	err = s.q.InsertQuestionReport(qctx, db.InsertQuestionReportParams{
		UserID: &p.user.ID, QuestionID: params.QuestionId, TrainingID: trainingID, Kind: string(req.Kind), Text: optPtr(req.Text),
	})
	if err != nil {
		return fmt.Errorf("insert question report: %w", err)
	}
	return nil
}

// questionOf — задание из строки базы в виде правил training.
func questionOf(r db.ListTrainingItemsRow) (training.Question, error) {
	q := training.Question{Type: training.Type(r.QuestionType), Answer: r.Answer}
	if err := json.Unmarshal(r.Body, &q.Body); err != nil {
		return training.Question{}, fmt.Errorf("decode question %s body: %w", r.QuestionID, err)
	}
	if err := json.Unmarshal(r.Explanation, &q.Explanation); err != nil {
		return training.Question{}, fmt.Errorf("decode question %s explanation: %w", r.QuestionID, err)
	}
	return q, nil
}

func sessionOf(tr db.Training, rows []db.ListTrainingItemsRow) (*api.TrainingSession, error) {
	items := make([]api.TrainingItem, 0, len(rows))
	for _, r := range rows {
		q, err := questionOf(r)
		if err != nil {
			return nil, err
		}
		item := api.TrainingItem{Position: r.Position, Question: apiQuestion(r, q)}
		if r.AnsweredAt != nil {
			a := api.GivenAnswer{
				Position: r.Position, OptionIds: r.OptionIds, DontKnow: r.DontKnow, Flagged: r.Flagged,
				AnsweredAt: *r.AnsweredAt,
			}
			if r.ElapsedMs != nil {
				a.ElapsedMs = *r.ElapsedMs
			}
			item.Answer = api.NewOptGivenAnswer(a)
		}
		if r.Correct != nil {
			item.Correct = api.NewOptBool(*r.Correct)
		}
		items = append(items, item)
	}
	types := make([]api.QuestionType, 0, len(tr.QuestionTypes))
	for _, t := range tr.QuestionTypes {
		types = append(types, api.QuestionType(t))
	}
	out := &api.TrainingSession{
		ID: tr.ID, Mode: api.TrainingMode(tr.Mode), Section: api.Section(tr.Section), QuestionTypes: types,
		StartedAt: tr.StartedAt, Items: items,
	}
	if tr.TimeLimitSeconds != nil {
		out.TimeLimitSeconds = api.NewOptInt(*tr.TimeLimitSeconds)
	}
	if tr.FinishedAt != nil {
		out.FinishedAt = api.NewOptDateTime(*tr.FinishedAt)
	}
	return out, nil
}

func apiQuestion(r db.ListTrainingItemsRow, q training.Question) api.Question {
	groups := make([]api.OptionGroup, 0, len(q.Body.Groups))
	for _, g := range q.Body.Groups {
		opts := make([]api.QuestionOption, 0, len(g.Options))
		for _, o := range g.Options {
			opts = append(opts, api.QuestionOption{ID: o.ID, Text: o.Text})
		}
		groups = append(groups, api.OptionGroup{Options: opts})
	}
	why := make([]api.OptionExplanation, 0, len(q.Explanation.Options))
	for _, o := range q.Explanation.Options {
		why = append(why, api.OptionExplanation{OptionId: o.OptionID, Text: api.LocalizedText{Ru: o.Text.Ru, En: o.Text.En}})
	}
	out := api.Question{
		ID: r.QuestionID, QuestionType: api.QuestionType(q.Type), Section: api.Section(r.Section), TopicId: r.TopicID,
		TopicTitle: api.LocalizedText{Ru: r.TitleRu, En: r.TitleEn}, Difficulty: api.Difficulty(r.Difficulty),
		Prompt: q.Body.Prompt, Groups: groups, SelectCount: q.Body.SelectCount, Answer: q.Answer,
		Explanation: api.Explanation{Solution: api.LocalizedText{Ru: q.Explanation.Solution.Ru, En: q.Explanation.Solution.En}, Options: why},
	}
	if q.Body.Condition != "" {
		out.Condition = api.NewOptString(q.Body.Condition)
	}
	if q.Body.QuantityA != "" {
		out.QuantityA = api.NewOptString(q.Body.QuantityA)
	}
	if q.Body.QuantityB != "" {
		out.QuantityB = api.NewOptString(q.Body.QuantityB)
	}
	return out
}
