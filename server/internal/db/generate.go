// Package db — запросы к Postgres, сгенерированные sqlc из internal/db/queries по схеме из
// internal/migrations. Руками не правится: go generate ./internal/db.
package db

//go:generate go tool -modfile=../../tools/go.mod sqlc generate -f ../../sqlc.yaml
