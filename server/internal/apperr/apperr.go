// Package apperr — ошибки, которые доходят до клиента: HTTP-статус и машинный код из договора
// (api/openapi.yaml, Error.code). Всё остальное клиент видит как internal, подробности — только в журнале.
package apperr

import (
	"errors"
	"fmt"
	"net/http"
)

// Code — машинный код ошибки. Клиент выбирает текст для человека по коду, а не по message.
type Code string

const (
	BadRequest          Code = "bad_request"
	Unauthorized        Code = "unauthorized"
	Forbidden           Code = "forbidden"
	NotFound            Code = "not_found"
	TooManyRequests     Code = "too_many_requests"
	InvalidInitData     Code = "invalid_init_data"
	InvalidIDToken      Code = "invalid_id_token"
	ProviderUnavailable Code = "provider_unavailable"
	// NoQuestions — под выбор конструктора нет ни одного проверенного задания.
	NoQuestions Code = "no_questions"
	// TrainingFinished — тренировка закончена, ответы больше не принимаются.
	TrainingFinished Code = "training_finished"
	Internal         Code = "internal"
)

// Error — ошибка с кодом для клиента и причиной для журнала.
type Error struct {
	Status int
	Code   Code
	// Message — коротко, для журнала и разработчика; на экран не идёт.
	Message string
	Err     error
}

func (e *Error) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.Err)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (e *Error) Unwrap() error { return e.Err }

// New — ошибка с кодом; err — причина для журнала (может быть nil).
func New(status int, code Code, message string, err error) *Error {
	return &Error{Status: status, Code: code, Message: message, Err: err}
}

func Unauthenticated(err error) *Error {
	return New(http.StatusUnauthorized, Unauthorized, "sign in required", err)
}

func Denied(message string) *Error {
	return New(http.StatusForbidden, Forbidden, message, nil)
}

func Invalid(message string, err error) *Error {
	return New(http.StatusBadRequest, BadRequest, message, err)
}

// As достаёт *Error из цепочки.
func As(err error) (*Error, bool) {
	var e *Error
	ok := errors.As(err, &e)
	return e, ok
}
