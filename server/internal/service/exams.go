package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/daryaleushkina/greprepapp/server/internal/api"
	"github.com/daryaleushkina/greprepapp/server/internal/apperr"
	"github.com/daryaleushkina/greprepapp/server/internal/db"
)

// GetExams — справочник для выбора до входа; порядок разделов задаёт база.
func (s *Service) GetExams(ctx context.Context) (*api.ExamList, error) {
	qctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()
	rows, err := s.q.ListExamSections(qctx)
	if err != nil {
		return nil, fmt.Errorf("list exam sections: %w", err)
	}
	exams := []api.ExamInfo{}
	for _, row := range rows {
		if len(exams) == 0 || string(exams[len(exams)-1].ID) != row.ExamID {
			exams = append(exams, api.ExamInfo{ID: api.Exam(row.ExamID), Sections: []api.Section{}})
		}
		last := &exams[len(exams)-1]
		last.Sections = append(last.Sections, api.Section(row.Section))
	}
	return &api.ExamList{Exams: exams}, nil
}

// SetActiveExam меняет только свой аккаунт; тренировки продолжают передавать exam явно.
func (s *Service) SetActiveExam(ctx context.Context, req *api.ExamChoice) (*api.User, error) {
	p, err := principalFrom(ctx)
	if err != nil {
		return nil, err
	}
	qctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()
	// Собираем ответ до записи: отказ чтения способов входа не должен менять аккаунт при ответе 500.
	user, err := s.apiUser(qctx, p.user)
	if err != nil {
		return nil, err
	}
	if err := s.q.SetActiveExam(qctx, db.SetActiveExamParams{UserID: p.user.ID, ExamID: string(req.Exam)}); err != nil {
		var pg *pgconn.PgError
		if errors.As(err, &pg) && pg.Code == "23503" {
			return nil, apperr.Invalid("unknown exam", err)
		}
		return nil, fmt.Errorf("set active exam: %w", err)
	}
	user.ActiveExam.SetTo(api.ActiveExam(req.Exam))
	return &user, nil
}
