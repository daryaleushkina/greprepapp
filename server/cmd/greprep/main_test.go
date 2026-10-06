package main

import (
	"context"
	"log/slog"
	"strings"
	"testing"

	"github.com/daryaleushkina/greprepapp/server/internal/config"
)

// Набор для разработки — approved без проверки Даши, поэтому в бою команда отказывается работать ещё до
// подключения к базе (адрес базы здесь нарочно недоступен).
func TestSeedDevRefusesProduction(t *testing.T) {
	t.Parallel()
	cfg := config.Config{Env: config.EnvProduction, DatabaseURL: "postgres://nobody@127.0.0.1:1/none"}
	err := seedDev(context.Background(), slog.New(slog.DiscardHandler), cfg)
	if err == nil || !strings.Contains(err.Error(), "not allowed with APP_ENV=production") {
		t.Fatalf("seed-dev in production: %v", err)
	}
}
