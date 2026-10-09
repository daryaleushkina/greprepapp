// Команда e2estack — стенд для сквозных тестов веба; Playwright поднимает её сам (apps/web/playwright.config.ts).
//
// Что внутри:
//   - своя база на локальном Postgres, каждый запуск — с нуля и с миграциями (данные сервера разработки на 8090
//     и база сценариев UI приложения Apple не трогаются);
//   - сервер API — тот же app.Handler, что в бою, с входом подменой (DEV_AUTH) и ключом тестового бота: им
//     фикстуры e2e подписывают initData, и мини-апп входит настоящим путём, с проверкой подписи;
//   - подменный провайдер OpenID Connect (oidc.go) вместо Telegram, Apple и Google: кнопки входа на сайте
//     проходят весь путь — переход к провайдеру, PKCE, обмен кода на сервере — без аккаунтов у компаний.
//
// В бой не попадает: это отдельный бинарник, а config разрешает http-издателя только не в production.
//
// Настройки — окружение (значения по умолчанию — для Мака, docs/HANDOFF.md, «Веб»):
//
//	TEST_DATABASE_URL  Postgres, где создаётся база стенда (как у интеграционных тестов)
//	E2E_DB             имя базы стенда (greprep_web_e2e)
//	E2E_API_ADDR       адрес API (127.0.0.1:8093)
//	E2E_OIDC_ADDR      адрес подменного провайдера (127.0.0.1:8094)
//	E2E_WEB_ORIGIN     адрес сайта под тестом — из него адрес возврата после входа (http://localhost:5191)
//	E2E_BOT_TOKEN      ключ тестового бота (обязателен; тот же, что у фикстур)
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"

	"github.com/daryaleushkina/greprepapp/server/internal/app"
	"github.com/daryaleushkina/greprepapp/server/internal/auth"
	"github.com/daryaleushkina/greprepapp/server/internal/config"
	"github.com/daryaleushkina/greprepapp/server/internal/devseed"
	"github.com/daryaleushkina/greprepapp/server/internal/migrations"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	err := run(ctx, log)
	stop()
	if err != nil {
		log.Error("e2estack", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func run(ctx context.Context, log *slog.Logger) error {
	admin := env("TEST_DATABASE_URL", "postgres://greprep:greprep@127.0.0.1:55432/greprep?sslmode=disable")
	dbName := env("E2E_DB", "greprep_web_e2e")
	apiAddr := env("E2E_API_ADDR", "127.0.0.1:8093")
	oidcAddr := env("E2E_OIDC_ADDR", "127.0.0.1:8094")
	webOrigin := env("E2E_WEB_ORIGIN", "http://localhost:5191")
	botToken := os.Getenv("E2E_BOT_TOKEN")
	if botToken == "" {
		return errors.New("E2E_BOT_TOKEN is required (apps/web/playwright.config.ts sets it)")
	}

	dbURL, err := freshDatabase(ctx, admin, dbName)
	if err != nil {
		return err
	}

	issuer := "http://" + oidcAddr
	redirect := []string{webOrigin + "/auth/callback"}
	fake, err := newFakeProvider(issuer, redirect)
	if err != nil {
		return err
	}
	provider := func(clientID string) config.Provider {
		return config.Provider{
			Issuer: issuer, Audiences: []string{clientID}, ClientID: clientID,
			ClientSecret: fakeClientSecret, RedirectURIs: redirect,
		}
	}
	cfg := config.Config{
		Env:             config.EnvTest,
		HTTPAddr:        apiAddr,
		DatabaseURL:     dbURL,
		Version:         "e2e",
		BotToken:        botToken,
		InitDataMaxAge:  time.Hour,
		DevAuth:         true,
		Telegram:        provider("e2e-telegram"),
		Apple:           provider("e2e-apple"),
		Google:          provider("e2e-google"),
		SessionIdle:     30 * 24 * time.Hour,
		SessionAbsolute: 180 * 24 * time.Hour,
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return fmt.Errorf("connect to %s: %w", dbName, err)
	}
	defer pool.Close()
	seed, err := devseed.Load()
	if err != nil {
		return fmt.Errorf("load e2e questions: %w", err)
	}
	seedCtx, seedCancel := context.WithTimeout(ctx, time.Minute)
	err = devseed.Apply(seedCtx, pool, seed)
	seedCancel()
	if err != nil {
		return fmt.Errorf("seed e2e questions: %w", err)
	}
	handler, err := app.Handler(cfg, pool, auth.NewOIDC(nil, cfg.Telegram, cfg.Apple, cfg.Google), log, time.Now)
	if err != nil {
		return err
	}

	servers := []*http.Server{
		{Addr: apiAddr, Handler: handler, ReadHeaderTimeout: 5 * time.Second},
		{Addr: oidcAddr, Handler: fake.handler(), ReadHeaderTimeout: 5 * time.Second},
	}
	errc := make(chan error, len(servers))
	for _, srv := range servers {
		srv.BaseContext = func(net.Listener) context.Context { return ctx }
		go func() { errc <- srv.ListenAndServe() }()
	}
	// Playwright ждёт ответа по адресу health — строка в журнал нужна человеку, который запустил стенд руками.
	fmt.Fprintf(os.Stderr, "e2estack: API %s, OIDC %s, база %s\n", apiAddr, issuer, dbName)

	select {
	case err := <-errc:
		return fmt.Errorf("listen: %w", err)
	case <-ctx.Done():
	}
	sctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	var errs []error
	for _, srv := range servers {
		if err := srv.Shutdown(sctx); err != nil {
			errs = append(errs, fmt.Errorf("shutdown %s: %w", srv.Addr, err))
		}
	}
	return errors.Join(errs...)
}

// freshDatabase пересоздаёт базу стенда и накатывает миграции: каждый прогон e2e начинается с чистой схемы
// той версии, что в рабочей папке. Возвращает адрес новой базы.
func freshDatabase(ctx context.Context, admin, name string) (string, error) {
	cctx, cancel := context.WithTimeout(ctx, time.Minute)
	defer cancel()
	conn, err := pgx.Connect(cctx, admin)
	if err != nil {
		return "", fmt.Errorf("connect to Postgres (docker compose up -d): %w", err)
	}
	ident := pgx.Identifier{name}.Sanitize()
	_, dropErr := conn.Exec(cctx, "DROP DATABASE IF EXISTS "+ident+" WITH (FORCE)")
	_, createErr := conn.Exec(cctx, "CREATE DATABASE "+ident)
	if err := errors.Join(dropErr, createErr, conn.Close(cctx)); err != nil {
		return "", fmt.Errorf("recreate database %s: %w", name, err)
	}

	u, err := url.Parse(admin)
	if err != nil {
		return "", fmt.Errorf("parse TEST_DATABASE_URL: %w", err)
	}
	u.Path = "/" + name
	cc, err := pgx.ParseConfig(u.String())
	if err != nil {
		return "", fmt.Errorf("parse database url: %w", err)
	}
	sqlDB := stdlib.OpenDB(*cc)
	_, upErr := migrations.Up(cctx, sqlDB)
	if err := errors.Join(upErr, sqlDB.Close()); err != nil {
		return "", fmt.Errorf("migrate %s: %w", name, err)
	}
	return u.String(), nil
}
