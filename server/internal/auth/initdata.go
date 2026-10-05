// Package auth — проверка входа: initData мини-аппа, id_token провайдеров (OIDC) и токены сессий.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ErrInvalidInitData — initData не прошла проверку. Подробность — в обёртке для журнала, человеку и
// клиенту — только код invalid_init_data.
var ErrInvalidInitData = errors.New("invalid init data")

// TelegramUser — то, что сервер берёт из initData. Остальные поля Telegram (фото, премиум и т. п.)
// не нужны и не читаются.
type TelegramUser struct {
	ID           int64
	FirstName    string
	LastName     string
	Username     string
	LanguageCode string
}

// InitData — проверенные данные запуска мини-аппа.
type InitData struct {
	User     TelegramUser
	AuthDate time.Time
}

// maxClockSkew — насколько auth_date может быть «из будущего»: часы сервера и Telegram расходятся.
const maxClockSkew = time.Minute

// VerifyInitData проверяет подпись initData ключом бота (HMAC-SHA-256, core.telegram.org/bots/webapps,
// «Validating data received via the Mini App») и её возраст.
//
// Своя реализация, а не библиотека: это два десятка строк, а у известной Go-библиотеки последний выпуск
// сравнивает подпись не за постоянное время и пропускает повторяющиеся ключи.
func VerifyInitData(raw, botToken string, maxAge time.Duration, now time.Time) (InitData, error) {
	if botToken == "" {
		return InitData{}, fmt.Errorf("%w: bot token is not configured", ErrInvalidInitData)
	}
	values, err := url.ParseQuery(raw)
	if err != nil {
		return InitData{}, fmt.Errorf("%w: parse: %w", ErrInvalidInitData, err)
	}
	pairs := make([]string, 0, len(values))
	var gotHash string
	for key, vs := range values {
		// Повтор ключа — подделка: подпись считается по одному значению, а прочитать можно другое.
		if len(vs) != 1 {
			return InitData{}, fmt.Errorf("%w: key %q repeated", ErrInvalidInitData, key)
		}
		if key == "hash" {
			gotHash = vs[0]
			continue
		}
		// signature (подпись Ed25519 для третьих сторон) входит в строку проверки — так в документации.
		pairs = append(pairs, key+"="+vs[0])
	}
	if gotHash == "" {
		return InitData{}, fmt.Errorf("%w: no hash", ErrInvalidInitData)
	}
	sort.Strings(pairs)
	checkString := strings.Join(pairs, "\n")

	secret := hmacSHA256([]byte("WebAppData"), []byte(botToken))
	want := hmacSHA256(secret, []byte(checkString))
	got, err := hex.DecodeString(gotHash)
	if err != nil || !hmac.Equal(got, want) {
		return InitData{}, fmt.Errorf("%w: bad hash", ErrInvalidInitData)
	}

	authUnix, err := strconv.ParseInt(values.Get("auth_date"), 10, 64)
	if err != nil {
		return InitData{}, fmt.Errorf("%w: auth_date: %w", ErrInvalidInitData, err)
	}
	authDate := time.Unix(authUnix, 0)
	if authDate.After(now.Add(maxClockSkew)) {
		return InitData{}, fmt.Errorf("%w: auth_date in the future", ErrInvalidInitData)
	}
	if now.Sub(authDate) > maxAge {
		return InitData{}, fmt.Errorf("%w: expired (%s old)", ErrInvalidInitData, now.Sub(authDate).Round(time.Second))
	}

	user, err := parseTelegramUser(values.Get("user"))
	if err != nil {
		return InitData{}, err
	}
	return InitData{User: user, AuthDate: authDate}, nil
}

// parseTelegramUser читает только нужные поля. Лишние поля здесь не ошибка: объект пользователя пишет
// Telegram и добавляет в него поля без предупреждения; правило «лишнее поле — 400» — для нашего API.
func parseTelegramUser(raw string) (TelegramUser, error) {
	if raw == "" {
		return TelegramUser{}, fmt.Errorf("%w: no user", ErrInvalidInitData)
	}
	var u struct {
		ID           *int64 `json:"id"`
		FirstName    string `json:"first_name"`
		LastName     string `json:"last_name"`
		Username     string `json:"username"`
		LanguageCode string `json:"language_code"`
	}
	if err := json.Unmarshal([]byte(raw), &u); err != nil {
		return TelegramUser{}, fmt.Errorf("%w: user: %w", ErrInvalidInitData, err)
	}
	if u.ID == nil || *u.ID <= 0 {
		return TelegramUser{}, fmt.Errorf("%w: user without id", ErrInvalidInitData)
	}
	return TelegramUser{
		ID:           *u.ID,
		FirstName:    u.FirstName,
		LastName:     u.LastName,
		Username:     u.Username,
		LanguageCode: u.LanguageCode,
	}, nil
}

func hmacSHA256(key, msg []byte) []byte {
	m := hmac.New(sha256.New, key)
	m.Write(msg) // запись в hash.Hash ошибок не возвращает (документация hash.Hash)
	return m.Sum(nil)
}

// DisplayName — имя для аккаунта из Telegram: имя и фамилия, иначе @username, иначе «Telegram».
func (u TelegramUser) DisplayName() string {
	name := strings.TrimSpace(strings.TrimSpace(u.FirstName) + " " + strings.TrimSpace(u.LastName))
	switch {
	case name != "":
		return truncate(name, 128)
	case u.Username != "":
		return truncate("@"+u.Username, 128)
	default:
		return "Telegram"
	}
}

// Locale — язык интерфейса по языку Telegram (PRODUCT.md, «Языки»). Языков интерфейса два; языки СНГ,
// которых у нас нет (белорусский, казахский, киргизский, узбекский, таджикский), — к русскому: аудитория
// русскоязычная (PRODUCT.md, «Users»). Остальное — английский; переключатель — в настройках.
func Locale(languageCode string) string {
	lang, _, _ := strings.Cut(strings.ToLower(languageCode), "-")
	switch lang {
	case "ru", "be", "kk", "ky", "uz", "tg":
		return "ru"
	default:
		return "en"
	}
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
