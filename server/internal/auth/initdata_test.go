package auth

import (
	"encoding/hex"
	"errors"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

const testBotToken = "123456:TEST-bot-token"

// signInitData подписывает initData так, как это делает Telegram: строка проверки из пар key=value по
// алфавиту через \n, HMAC-SHA-256 ключом HMAC("WebAppData", токен бота).
func signInitData(t *testing.T, botToken string, fields map[string]string) string {
	t.Helper()
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	pairs := make([]string, 0, len(keys))
	v := url.Values{}
	for _, k := range keys {
		pairs = append(pairs, k+"="+fields[k])
		v.Set(k, fields[k])
	}
	secret := hmacSHA256([]byte("WebAppData"), []byte(botToken))
	v.Set("hash", hex.EncodeToString(hmacSHA256(secret, []byte(strings.Join(pairs, "\n")))))
	return v.Encode()
}

func baseFields(now time.Time) map[string]string {
	return map[string]string{
		"auth_date": strconv.FormatInt(now.Add(-time.Minute).Unix(), 10),
		"query_id":  "AAH",
		"user":      `{"id":42,"first_name":"Маша","last_name":"Иванова","username":"masha","language_code":"ru","is_premium":true}`,
		"signature": "ed25519-signature-is-part-of-check-string",
	}
}

func TestVerifyInitData(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC)

	t.Run("valid", func(t *testing.T) {
		t.Parallel()
		got, err := VerifyInitData(signInitData(t, testBotToken, baseFields(now)), testBotToken, time.Hour, now)
		if err != nil {
			t.Fatalf("VerifyInitData: %v", err)
		}
		if got.User.ID != 42 || got.User.Username != "masha" || got.User.LanguageCode != "ru" {
			t.Fatalf("user = %+v", got.User)
		}
		if !got.AuthDate.Equal(now.Add(-time.Minute)) {
			t.Fatalf("auth date = %v", got.AuthDate)
		}
	})

	reject := []struct {
		name string
		raw  func(t *testing.T) string
		max  time.Duration
		bot  string
	}{
		{"wrong bot token", func(t *testing.T) string { return signInitData(t, "999:other", baseFields(now)) }, time.Hour, testBotToken},
		{"no bot token configured", func(t *testing.T) string { return signInitData(t, testBotToken, baseFields(now)) }, time.Hour, ""},
		{"tampered user", func(t *testing.T) string {
			return strings.Replace(signInitData(t, testBotToken, baseFields(now)), "%22id%22%3A42", "%22id%22%3A43", 1)
		}, time.Hour, testBotToken},
		{"no hash", func(t *testing.T) string {
			v, _ := url.ParseQuery(signInitData(t, testBotToken, baseFields(now)))
			v.Del("hash")
			return v.Encode()
		}, time.Hour, testBotToken},
		{"hash not hex", func(t *testing.T) string {
			v, _ := url.ParseQuery(signInitData(t, testBotToken, baseFields(now)))
			v.Set("hash", "zz")
			return v.Encode()
		}, time.Hour, testBotToken},
		{"repeated key", func(t *testing.T) string {
			return signInitData(t, testBotToken, baseFields(now)) + "&user=%7B%22id%22%3A1%7D"
		}, time.Hour, testBotToken},
		{"expired", func(t *testing.T) string { return signInitData(t, testBotToken, baseFields(now)) }, 30 * time.Second, testBotToken},
		{"from the future", func(t *testing.T) string {
			f := baseFields(now)
			f["auth_date"] = strconv.FormatInt(now.Add(time.Hour).Unix(), 10)
			return signInitData(t, testBotToken, f)
		}, time.Hour, testBotToken},
		{"auth_date not a number", func(t *testing.T) string {
			f := baseFields(now)
			f["auth_date"] = "yesterday"
			return signInitData(t, testBotToken, f)
		}, time.Hour, testBotToken},
		{"no user", func(t *testing.T) string {
			f := baseFields(now)
			delete(f, "user")
			return signInitData(t, testBotToken, f)
		}, time.Hour, testBotToken},
		{"user without id", func(t *testing.T) string {
			f := baseFields(now)
			f["user"] = `{"first_name":"Маша"}`
			return signInitData(t, testBotToken, f)
		}, time.Hour, testBotToken},
		{"user not json", func(t *testing.T) string {
			f := baseFields(now)
			f["user"] = `{"id":`
			return signInitData(t, testBotToken, f)
		}, time.Hour, testBotToken},
		{"broken query", func(t *testing.T) string { return "%zz" }, time.Hour, testBotToken},
	}
	for _, tc := range reject {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := VerifyInitData(tc.raw(t), tc.bot, tc.max, now)
			if !errors.Is(err, ErrInvalidInitData) {
				t.Fatalf("err = %v, want ErrInvalidInitData", err)
			}
		})
	}
}

func TestDisplayName(t *testing.T) {
	t.Parallel()
	cases := []struct {
		u    TelegramUser
		want string
	}{
		{TelegramUser{FirstName: " Маша ", LastName: "Иванова"}, "Маша Иванова"},
		{TelegramUser{FirstName: "Маша"}, "Маша"},
		{TelegramUser{Username: "masha"}, "@masha"},
		{TelegramUser{}, "Telegram"},
		{TelegramUser{FirstName: strings.Repeat("я", 200)}, strings.Repeat("я", 128)},
	}
	for _, c := range cases {
		if got := c.u.DisplayName(); got != c.want {
			t.Errorf("DisplayName(%+v) = %q, want %q", c.u, got, c.want)
		}
	}
}

func TestLocale(t *testing.T) {
	t.Parallel()
	for code, want := range map[string]string{"ru": "ru", "ru-RU": "ru", "kk": "ru", "uz": "ru", "en": "en", "de": "en", "": "en"} {
		if got := Locale(code); got != want {
			t.Errorf("Locale(%q) = %q, want %q", code, got, want)
		}
	}
}
