// Команда greprep — сервер GrePrepApp.
//
//	greprep serve           — API на HTTP_ADDR (за Caddy)
//	greprep migrate up      — применить новые миграции (выкладка делает это до переключения сборки)
//	greprep migrate status  — какие миграции применены
//	greprep seed-dev        — набор заданий для разработки (локально и на стенде; в бою запрещено)
//
// Настройки — переменные окружения (server/.env.example).
package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
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
	"github.com/daryaleushkina/greprepapp/server/internal/db"
	"github.com/daryaleushkina/greprepapp/server/internal/devseed"
	"github.com/daryaleushkina/greprepapp/server/internal/migrations"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	err := run(ctx, log, os.Args[1:])
	stop()
	if err != nil {
		log.Error("exit", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

func run(ctx context.Context, log *slog.Logger, args []string) error {
	if len(args) == 0 {
		return errors.New("usage: greprep serve | migrate up | migrate status | seed-dev")
	}
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	switch {
	case args[0] == "serve":
		return serve(ctx, log, cfg)
	case args[0] == "migrate" && len(args) == 2 && args[1] == "up":
		return migrateUp(ctx, log, cfg)
	case args[0] == "migrate" && len(args) == 2 && args[1] == "status":
		return migrateStatus(ctx, log, cfg)
	case args[0] == "seed-dev" && len(args) == 1:
		return seedDev(ctx, log, cfg)
	default:
		return fmt.Errorf("unknown command %q", args)
	}
}

func openSQL(cfg config.Config) (*pgx.ConnConfig, error) {
	cc, err := pgx.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	return cc, nil
}

func migrateUp(ctx context.Context, log *slog.Logger, cfg config.Config) error {
	cc, err := openSQL(cfg)
	if err != nil {
		return err
	}
	sqlDB := stdlib.OpenDB(*cc)
	defer closeDB(log, sqlDB)
	mctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	res, err := migrations.Up(mctx, sqlDB)
	for _, r := range res {
		log.Info("migration", slog.String("source", r.Source.Path), slog.Duration("duration", r.Duration))
	}
	return err
}

func migrateStatus(ctx context.Context, log *slog.Logger, cfg config.Config) error {
	cc, err := openSQL(cfg)
	if err != nil {
		return err
	}
	sqlDB := stdlib.OpenDB(*cc)
	defer closeDB(log, sqlDB)
	st, err := migrations.Status(ctx, sqlDB)
	if err != nil {
		return err
	}
	for _, m := range st {
		fmt.Printf("%-8s %s\n", m.State, m.Source.Path)
	}
	return nil
}

// seedDev записывает набор заданий для разработки (internal/devseed). В бою не запускается: контент для
// людей приходит через админку после проверки Даши.
func seedDev(ctx context.Context, log *slog.Logger, cfg config.Config) error {
	if cfg.Env == config.EnvProduction {
		return errors.New("seed-dev is not allowed with APP_ENV=production")
	}
	set, err := devseed.Load()
	if err != nil {
		return err
	}
	sctx, cancel := context.WithTimeout(ctx, time.Minute)
	defer cancel()
	pool, err := pgxpool.New(sctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	defer pool.Close()
	if err := devseed.Apply(sctx, pool, set); err != nil {
		return err
	}
	log.Info("dev seed", slog.Int("topics", len(set.Topics)), slog.Int("questions", len(set.Questions)))
	return nil
}

// closeDB закрывает соединение после работы команды; ошибка закрытия — только в журнал.
func closeDB(log *slog.Logger, db *sql.DB) {
	if err := db.Close(); err != nil {
		log.Warn("close database", slog.String("error", err.Error()))
	}
}

func serve(ctx context.Context, log *slog.Logger, cfg config.Config) error {
	pcfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	// Пул ограничен: Postgres на том же сервере обслуживает и бой, и стенд.
	pcfg.MaxConns = 10
	pool, err := pgxpool.NewWithConfig(ctx, pcfg)
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	defer pool.Close()

	oidc := auth.NewOIDC(nil, cfg.Telegram, cfg.Apple, cfg.Google)
	handler, err := app.Handler(cfg, pool, oidc, log, time.Now)
	if err != nil {
		return err
	}
	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       2 * time.Minute,
		BaseContext:       func(_ net.Listener) context.Context { return ctx },
	}

	cleanupDone := make(chan struct{})
	go func() {
		defer close(cleanupDone)
		cleanup(ctx, log, db.New(pool))
	}()

	errc := make(chan error, 1)
	go func() {
		log.Info("listening", slog.String("addr", cfg.HTTPAddr), slog.String("env", string(cfg.Env)), slog.String("version", cfg.Version))
		errc <- srv.ListenAndServe()
	}()

	select {
	case err := <-errc:
		return fmt.Errorf("listen: %w", err)
	case <-ctx.Done():
	}
	// Плавная остановка: новые соединения не принимаем, текущие запросы дорабатывают. Caddy тем временем
	// повторяет соединение (lb_try_duration), и выкладка видна людям как короткая пауза, а не ошибка.
	sctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 20*time.Second)
	defer cancel()
	if err := srv.Shutdown(sctx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	<-cleanupDone
	return nil
}

// cleanup раз в час удаляет истёкшие сессии и старые ошибки клиентов. Живёт, пока жив сервер.
func cleanup(ctx context.Context, log *slog.Logger, q *db.Queries) {
	tick := time.NewTicker(time.Hour)
	defer tick.Stop()
	for {
		cctx, cancel := context.WithTimeout(ctx, time.Minute)
		if n, err := q.DeleteExpiredSessions(cctx); err != nil {
			log.Error("cleanup sessions", slog.String("error", err.Error()))
		} else if n > 0 {
			log.Info("cleanup sessions", slog.Int64("deleted", n))
		}
		if n, err := q.DeleteOldClientErrors(cctx); err != nil {
			log.Error("cleanup client errors", slog.String("error", err.Error()))
		} else if n > 0 {
			log.Info("cleanup client errors", slog.Int64("deleted", n))
		}
		cancel()
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}
