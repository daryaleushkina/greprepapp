package migrations_test

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"

	"github.com/daryaleushkina/greprepapp/server/internal/migrations"
)

// Миграции на пустой базе: всё применяется, повторный запуск ничего не делает, статус — всё применено.
// Шаблон testdb этого не проверяет: он создаётся один раз и потом переиспользуется.
func TestUpFromScratch(t *testing.T) {
	admin := os.Getenv("TEST_DATABASE_URL")
	if admin == "" {
		t.Fatal("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	name := "greprep_migrations_test"
	conn, err := pgx.Connect(ctx, admin)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = conn.Exec(context.Background(), "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
		_ = conn.Close(context.Background())
	})
	if _, err := conn.Exec(ctx, "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)"); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}
	cc, err := pgx.ParseConfig(admin)
	if err != nil {
		t.Fatal(err)
	}
	cc.Database = name
	db := stdlib.OpenDB(*cc)
	t.Cleanup(func() { _ = db.Close() })

	first, err := migrations.Up(ctx, db)
	if err != nil {
		t.Fatalf("Up: %v", err)
	}
	if len(first) == 0 {
		t.Fatal("no migrations applied to an empty database")
	}
	again, err := migrations.Up(ctx, db)
	if err != nil || len(again) != 0 {
		t.Fatalf("second Up: %d applied, err %v; want 0, nil", len(again), err)
	}
	st, err := migrations.Status(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range st {
		if m.State != "applied" {
			t.Fatalf("%s is %s", m.Source.Path, m.State)
		}
	}
}
