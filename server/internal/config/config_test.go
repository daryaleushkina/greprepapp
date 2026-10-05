package config

import (
	"strings"
	"testing"
	"time"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestDefaults(t *testing.T) {
	t.Parallel()
	c, err := parse(env(map[string]string{"DATABASE_URL": "postgres://x"}))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if c.Env != EnvDevelopment || c.HTTPAddr != "127.0.0.1:8090" || c.DevAuth {
		t.Fatalf("defaults = %+v", c)
	}
	if c.SessionIdle != 30*24*time.Hour || c.SessionAbsolute != 180*24*time.Hour || c.InitDataMaxAge != 24*time.Hour {
		t.Fatalf("durations = %v %v %v", c.SessionIdle, c.SessionAbsolute, c.InitDataMaxAge)
	}
	if c.Telegram.Enabled() || c.Apple.Enabled() || c.Google.Enabled() {
		t.Fatal("providers must be off without an issuer")
	}
}

// Вход подменой в бою — вход в любой аккаунт. Сервер с такой настройкой не стартует.
func TestProductionRefusesDevAuth(t *testing.T) {
	t.Parallel()
	_, err := parse(env(map[string]string{"APP_ENV": "production", "DATABASE_URL": "postgres://x", "BOT_TOKEN": "t", "DEV_AUTH": "1"}))
	if err == nil || !strings.Contains(err.Error(), "DEV_AUTH") {
		t.Fatalf("err = %v, want DEV_AUTH refused in production", err)
	}
}

func TestStagingAllowsDevAuth(t *testing.T) {
	t.Parallel()
	c, err := parse(env(map[string]string{"APP_ENV": "staging", "DATABASE_URL": "postgres://x", "DEV_AUTH": "true"}))
	if err != nil || !c.DevAuth {
		t.Fatalf("staging with DEV_AUTH: %+v, %v", c, err)
	}
}

func TestProviders(t *testing.T) {
	t.Parallel()
	c, err := parse(env(map[string]string{
		"DATABASE_URL":          "postgres://x",
		"APPLE_OIDC_ISSUER":     "https://appleid.apple.com",
		"APPLE_OIDC_AUDIENCES":  "app.bundle, web.services ,",
		"APPLE_OIDC_CLIENT_ID":  "web.services",
		"GOOGLE_OIDC_ISSUER":    "http://127.0.0.1:9999",
		"GOOGLE_OIDC_AUDIENCES": "g",
	}))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got := strings.Join(c.Apple.Audiences, "|"); got != "app.bundle|web.services" {
		t.Fatalf("audiences = %q", got)
	}
	if !c.Google.Enabled() {
		t.Fatal("local http issuer must be allowed outside production")
	}
}

func TestErrorsAreCollected(t *testing.T) {
	t.Parallel()
	_, err := parse(env(map[string]string{
		"APP_ENV":              "production",
		"DEV_AUTH":             "maybe",
		"SESSION_IDLE":         "-1h",
		"INIT_DATA_MAX_AGE":    "soon",
		"TELEGRAM_OIDC_ISSUER": "http://127.0.0.1:1",
		"APPLE_OIDC_ISSUER":    "https://appleid.apple.com",
	}))
	if err == nil {
		t.Fatal("want error")
	}
	for _, want := range []string{"DATABASE_URL", "BOT_TOKEN", "DEV_AUTH: not a boolean", "SESSION_IDLE", "INIT_DATA_MAX_AGE", "TELEGRAM_OIDC_ISSUER: must be an https URL", "APPLE_OIDC_AUDIENCES: required"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error does not mention %q:\n%v", want, err)
		}
	}
}

func TestUnknownEnvAndIdleLongerThanAbsolute(t *testing.T) {
	t.Parallel()
	_, err := parse(env(map[string]string{"APP_ENV": "prod", "DATABASE_URL": "x", "SESSION_IDLE": "48h", "SESSION_ABSOLUTE": "24h"}))
	if err == nil || !strings.Contains(err.Error(), "APP_ENV: unknown") || !strings.Contains(err.Error(), "longer than SESSION_ABSOLUTE") {
		t.Fatalf("err = %v", err)
	}
}
