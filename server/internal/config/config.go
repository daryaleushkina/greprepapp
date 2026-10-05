// Package config — настройки сервера из переменных окружения. Секреты — только здесь, из окружения;
// в репозитории — server/.env.example с пустыми значениями.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Env — где работает сервер. От него зависит, что разрешено: вход подменой — только не в бою.
type Env string

const (
	EnvDevelopment Env = "development"
	EnvTest        Env = "test"
	EnvStaging     Env = "staging"
	EnvProduction  Env = "production"
)

// Provider — настройки одного провайдера входа (Telegram, Apple, Google) по OpenID Connect.
// Пустой Issuer — провайдер выключен: кнопка входа отвечает provider_unavailable.
type Provider struct {
	Issuer string
	// Audiences — допустимые получатели id_token: у Apple на iPhone это bundle ID, на сайте — Services ID;
	// у Google — client ID сервера, который указывают и Credential Manager, и веб-кнопка.
	Audiences []string
	// ClientID и ClientSecret — для обмена кода на сервере (Telegram, Apple на сайте и Android).
	ClientID     string
	ClientSecret string
	// RedirectURIs — зарегистрированные у провайдера адреса возврата; чужой адрес в запросе — отказ.
	RedirectURIs []string
}

// Enabled — провайдер настроен.
func (p Provider) Enabled() bool { return p.Issuer != "" }

type Config struct {
	Env         Env
	HTTPAddr    string
	DatabaseURL string
	// Version — коммит сборки; /api/health отдаёт его для сверки «в бою новое».
	Version string

	// BotToken — токен бота: им проверяется подпись initData мини-аппа.
	BotToken string
	// InitDataMaxAge — сколько живёт initData для входа. Мини-апп меняет её на сессию при каждом запуске.
	InitDataMaxAge time.Duration

	// DevAuth — вход подменой (/api/auth/dev) для локального запуска, e2e и стенда. В бою запрещён.
	DevAuth bool

	Telegram Provider
	Apple    Provider
	Google   Provider

	// SessionIdle и SessionAbsolute — сроки сессии. OWASP для приложений с низким риском приводит
	// простой 15–30 минут; у нас приложение для занятий урывками с телефона, и вход заново каждый день
	// противоречит «один шаг до дела» (PRODUCT.md). Поэтому долгие сроки, а взамен: в базе только хэш
	// токена, выход и «выйти на всех устройствах» удаляют сессию сразу, чувствительное — с повторным входом.
	SessionIdle     time.Duration
	SessionAbsolute time.Duration
}

// Load читает окружение. Ошибка — с перечнем всего неверного сразу, чтобы чинить за один заход.
func Load() (Config, error) {
	return parse(os.Getenv)
}

func parse(get func(string) string) (Config, error) {
	var errs []error
	env := Env(strings.TrimSpace(get("APP_ENV")))
	if env == "" {
		env = EnvDevelopment
	}
	str := func(key, def string) string {
		if v := strings.TrimSpace(get(key)); v != "" {
			return v
		}
		return def
	}
	boolean := func(key string, def bool) bool {
		v := strings.TrimSpace(get(key))
		if v == "" {
			return def
		}
		b, err := strconv.ParseBool(v)
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: not a boolean: %q", key, v))
			return def
		}
		return b
	}
	duration := func(key string, def time.Duration) time.Duration {
		v := strings.TrimSpace(get(key))
		if v == "" {
			return def
		}
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			errs = append(errs, fmt.Errorf("%s: not a positive duration: %q", key, v))
			return def
		}
		return d
	}
	list := func(key string) []string {
		var out []string
		for part := range strings.SplitSeq(get(key), ",") {
			if p := strings.TrimSpace(part); p != "" {
				out = append(out, p)
			}
		}
		return out
	}
	provider := func(prefix string) Provider {
		p := Provider{
			Issuer:       str(prefix+"_ISSUER", ""),
			Audiences:    list(prefix + "_AUDIENCES"),
			ClientID:     str(prefix+"_CLIENT_ID", ""),
			ClientSecret: str(prefix+"_CLIENT_SECRET", ""),
			RedirectURIs: list(prefix + "_REDIRECT_URIS"),
		}
		if p.Issuer == "" {
			return p
		}
		// http — только для подменного провайдера в тестах (httptest слушает 127.0.0.1), и не в бою.
		u, err := url.Parse(p.Issuer)
		local := err == nil && u.Scheme == "http" && u.Hostname() == "127.0.0.1" && env != EnvProduction
		if err != nil || u.Scheme != "https" && !local {
			errs = append(errs, fmt.Errorf("%s_ISSUER: must be an https URL: %q", prefix, p.Issuer))
		}
		if len(p.Audiences) == 0 {
			errs = append(errs, fmt.Errorf("%s_AUDIENCES: required when %s_ISSUER is set", prefix, prefix))
		}
		return p
	}

	c := Config{
		Env:             env,
		HTTPAddr:        str("HTTP_ADDR", "127.0.0.1:8090"),
		DatabaseURL:     str("DATABASE_URL", ""),
		Version:         str("APP_VERSION", "dev"),
		BotToken:        str("BOT_TOKEN", ""),
		InitDataMaxAge:  duration("INIT_DATA_MAX_AGE", 24*time.Hour),
		DevAuth:         boolean("DEV_AUTH", false),
		Telegram:        provider("TELEGRAM_OIDC"),
		Apple:           provider("APPLE_OIDC"),
		Google:          provider("GOOGLE_OIDC"),
		SessionIdle:     duration("SESSION_IDLE", 30*24*time.Hour),
		SessionAbsolute: duration("SESSION_ABSOLUTE", 180*24*time.Hour),
	}

	switch c.Env {
	case EnvDevelopment, EnvTest, EnvStaging, EnvProduction:
	default:
		errs = append(errs, fmt.Errorf("APP_ENV: unknown %q (development, test, staging, production)", c.Env))
	}
	if c.DatabaseURL == "" {
		errs = append(errs, errors.New("DATABASE_URL: required"))
	}
	if c.SessionIdle > c.SessionAbsolute {
		errs = append(errs, errors.New("SESSION_IDLE: longer than SESSION_ABSOLUTE"))
	}
	// Вход подменой в бою — это вход в любой аккаунт без пароля. Сервер с такой настройкой не стартует.
	if c.Env == EnvProduction && c.DevAuth {
		errs = append(errs, errors.New("DEV_AUTH: forbidden with APP_ENV=production"))
	}
	if c.Env == EnvProduction && c.BotToken == "" {
		errs = append(errs, errors.New("BOT_TOKEN: required with APP_ENV=production"))
	}
	if len(errs) > 0 {
		return Config{}, fmt.Errorf("config: %w", errors.Join(errs...))
	}
	return c, nil
}
