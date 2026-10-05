// Package app собирает сервер из частей: обработчики, сгенерированный роутер и обвязка HTTP. Тот же
// сборщик используют и бой, и интеграционные тесты — тесты проверяют ровно то, что работает в бою.
package app

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/daryaleushkina/greprepapp/server/internal/api"
	"github.com/daryaleushkina/greprepapp/server/internal/auth"
	"github.com/daryaleushkina/greprepapp/server/internal/config"
	"github.com/daryaleushkina/greprepapp/server/internal/httpx"
	"github.com/daryaleushkina/greprepapp/server/internal/service"
)

// maxBody — больше 64 КБ в наш API ничего не шлёт (самое большое — стек ошибки клиента, 16 КБ).
const maxBody = 64 << 10

// Handler — весь HTTP-сервер API.
func Handler(cfg config.Config, pool *pgxpool.Pool, oidc *auth.OIDC, log *slog.Logger, now func() time.Time) (http.Handler, error) {
	svc := service.New(cfg, pool, oidc, log, now)
	srv, err := api.NewServer(svc, svc,
		api.WithErrorHandler(svc.ErrorHandler),
		api.WithNotFound(func(w http.ResponseWriter, r *http.Request) {
			httpx.WriteError(w, r, http.StatusNotFound, "not_found", "not found")
		}),
		api.WithMethodNotAllowed(func(w http.ResponseWriter, r *http.Request, allowed string) {
			w.Header().Set("Allow", allowed)
			httpx.WriteError(w, r, http.StatusMethodNotAllowed, "bad_request", "method not allowed")
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("build api server: %w", err)
	}
	// Вход и ошибки клиентов открыты без входа — их ограничиваем по частоте с одного адреса.
	limiter := httpx.NewLimiter(30, 10)
	var h http.Handler = srv
	h = httpx.CrossOrigin(h)
	h = limiter.Limit([]string{"/api/auth/", "/api/client-errors"}, h)
	h = httpx.MaxBody(maxBody, h)
	h = httpx.SecureHeaders(h)
	h = httpx.Recover(log, h)
	h = httpx.Log(log, h)
	return h, nil
}
