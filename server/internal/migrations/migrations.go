// Package migrations — схема базы файлами SQL, встроенными в бинарник. Применяет их команда
// `greprep migrate up` (goose) до переключения на новую сборку.
package migrations

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"

	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
)

//go:embed *.sql
var files embed.FS

// FS — файлы миграций (их же читает sqlc при генерации запросов).
func FS() fs.FS { return files }

// Up применяет все новые миграции. Блокировка в Postgres не даёт двум выкладкам (бой и стенд на одном
// сервере, повторный запуск) накатывать одно и то же одновременно.
func Up(ctx context.Context, db *sql.DB) ([]*goose.MigrationResult, error) {
	p, err := provider(db)
	if err != nil {
		return nil, err
	}
	res, err := p.Up(ctx)
	if err != nil {
		return res, fmt.Errorf("apply migrations: %w", err)
	}
	return res, nil
}

// Status — какие миграции применены.
func Status(ctx context.Context, db *sql.DB) ([]*goose.MigrationStatus, error) {
	p, err := provider(db)
	if err != nil {
		return nil, err
	}
	st, err := p.Status(ctx)
	if err != nil {
		return nil, fmt.Errorf("migration status: %w", err)
	}
	return st, nil
}

func provider(db *sql.DB) (*goose.Provider, error) {
	locker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		return nil, fmt.Errorf("migration locker: %w", err)
	}
	p, err := goose.NewProvider(goose.DialectPostgres, db, files, goose.WithSessionLocker(locker))
	if err != nil {
		return nil, fmt.Errorf("migration provider: %w", err)
	}
	return p, nil
}
