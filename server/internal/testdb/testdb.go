// Package testdb — своя база Postgres на каждый тест, клон шаблона с уже применёнными миграциями.
// Клон создаётся за доли секунды, тесты идут параллельно и не видят данных друг друга.
//
// Адрес сервера — TEST_DATABASE_URL (локально — compose.yaml, в CI — сервис postgres). Нет переменной —
// тест падает, а не пропускается: пропущенный интеграционный тест в гейте — дыра.
package testdb

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io/fs"
	"os"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"

	"github.com/daryaleushkina/greprepapp/server/internal/migrations"
)

var (
	templateOnce sync.Once
	templateName string
	templateErr  error
)

// New — пул соединений к свежей базе для теста; база удаляется после теста.
func New(t testing.TB) *pgxpool.Pool {
	t.Helper()
	admin := os.Getenv("TEST_DATABASE_URL")
	if admin == "" {
		t.Fatal("TEST_DATABASE_URL is not set: start Postgres (docker compose up -d) and export it, see docs/HANDOFF.md, «Бэкенд»")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	templateOnce.Do(func() { templateName, templateErr = ensureTemplate(ctx, admin) })
	if templateErr != nil {
		t.Fatalf("prepare template database: %v", templateErr)
	}

	name := "greprep_test_" + randomSuffix()
	if err := exec(ctx, admin, fmt.Sprintf("CREATE DATABASE %s TEMPLATE %s", pgx.Identifier{name}.Sanitize(), pgx.Identifier{templateName}.Sanitize())); err != nil {
		t.Fatalf("create test database: %v", err)
	}
	cfg, err := pgxpool.ParseConfig(admin)
	if err != nil {
		t.Fatalf("parse TEST_DATABASE_URL: %v", err)
	}
	cfg.ConnConfig.Database = name
	cfg.MaxConns = 4
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("connect to test database: %v", err)
	}
	t.Cleanup(func() {
		pool.Close()
		dctx, dcancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer dcancel()
		if err := exec(dctx, admin, fmt.Sprintf("DROP DATABASE IF EXISTS %s WITH (FORCE)", pgx.Identifier{name}.Sanitize())); err != nil {
			t.Errorf("drop test database: %v", err)
		}
	})
	return pool
}

// ensureTemplate создаёт шаблон с миграциями, если его ещё нет. Имя шаблона — от содержимого миграций:
// поменялась миграция — новый шаблон. Пакеты тестов идут параллельными процессами, поэтому создание
// шаблона — под блокировкой в самом Postgres.
func ensureTemplate(ctx context.Context, admin string) (string, error) {
	sum, err := migrationsHash()
	if err != nil {
		return "", err
	}
	name := "greprep_tmpl_" + sum[:16]

	conn, err := pgx.Connect(ctx, admin)
	if err != nil {
		return "", fmt.Errorf("connect: %w", err)
	}
	// Закрытие и снятие блокировки — уборка после подготовки; их ошибки на результат не влияют
	// (блокировка снимается и с закрытием соединения).
	defer func() { _ = conn.Close(context.WithoutCancel(ctx)) }()
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock(726371)"); err != nil {
		return "", fmt.Errorf("lock: %w", err)
	}
	defer func() { _, _ = conn.Exec(context.WithoutCancel(ctx), "SELECT pg_advisory_unlock(726371)") }()

	var exists bool
	if err := conn.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)", name).Scan(&exists); err != nil {
		return "", fmt.Errorf("check template: %w", err)
	}
	if exists {
		return name, nil
	}
	building := name + "_build"
	if _, err := conn.Exec(ctx, fmt.Sprintf("DROP DATABASE IF EXISTS %s WITH (FORCE)", pgx.Identifier{building}.Sanitize())); err != nil {
		return "", fmt.Errorf("drop stale template: %w", err)
	}
	if _, err := conn.Exec(ctx, fmt.Sprintf("CREATE DATABASE %s", pgx.Identifier{building}.Sanitize())); err != nil {
		return "", fmt.Errorf("create template: %w", err)
	}
	cc, err := pgx.ParseConfig(admin)
	if err != nil {
		return "", fmt.Errorf("parse url: %w", err)
	}
	cc.Database = building
	sqlDB := stdlib.OpenDB(*cc)
	_, err = migrations.Up(ctx, sqlDB)
	closeErr := sqlDB.Close()
	if err != nil {
		return "", fmt.Errorf("migrate template: %w", err)
	}
	if closeErr != nil {
		return "", fmt.Errorf("close template connection: %w", closeErr)
	}
	// Шаблон получает окончательное имя, только когда миграции применились целиком.
	if _, err := conn.Exec(ctx, fmt.Sprintf("ALTER DATABASE %s RENAME TO %s", pgx.Identifier{building}.Sanitize(), pgx.Identifier{name}.Sanitize())); err != nil {
		return "", fmt.Errorf("rename template: %w", err)
	}
	return name, nil
}

func migrationsHash() (string, error) {
	h := sha256.New()
	var names []string
	err := fs.WalkDir(migrations.FS(), ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			names = append(names, path)
		}
		return nil
	})
	if err != nil {
		return "", fmt.Errorf("list migrations: %w", err)
	}
	sort.Strings(names)
	for _, n := range names {
		b, err := fs.ReadFile(migrations.FS(), n)
		if err != nil {
			return "", fmt.Errorf("read migration %s: %w", n, err)
		}
		h.Write([]byte(n))
		h.Write(b)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func exec(ctx context.Context, admin, sql string) error {
	conn, err := pgx.Connect(ctx, admin)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	_, err = conn.Exec(ctx, sql)
	closeErr := conn.Close(ctx)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	if closeErr != nil {
		return fmt.Errorf("close: %w", closeErr)
	}
	return nil
}

func randomSuffix() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b) // crypto/rand.Read не возвращает ошибку с Go 1.24
	return hex.EncodeToString(b)
}
