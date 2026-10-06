package app

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"maps"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/daryaleushkina/greprepapp/server/internal/auth"
	"github.com/daryaleushkina/greprepapp/server/internal/config"
	"github.com/daryaleushkina/greprepapp/server/internal/oidctest"
	"github.com/daryaleushkina/greprepapp/server/internal/testdb"
)

const botToken = "123456:TEST-bot-token"

type env struct {
	srv  *httptest.Server
	pool *pgxpool.Pool
}

func newEnv(t *testing.T, mutate func(*config.Config)) *env {
	t.Helper()
	pool := testdb.New(t)
	cfg := config.Config{
		Env:             config.EnvTest,
		Version:         "test-sha",
		BotToken:        botToken,
		InitDataMaxAge:  time.Hour,
		DevAuth:         true,
		SessionIdle:     30 * 24 * time.Hour,
		SessionAbsolute: 180 * 24 * time.Hour,
	}
	if mutate != nil {
		mutate(&cfg)
	}
	log := slog.New(slog.DiscardHandler)
	oidc := auth.NewOIDC(nil, cfg.Telegram, cfg.Apple, cfg.Google)
	h, err := Handler(cfg, pool, oidc, log, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	// TLS: кука __Host-session — Secure, по http её не вернёт ни браузер, ни cookiejar.
	srv := httptest.NewTLSServer(h)
	t.Cleanup(srv.Close)
	return &env{srv: srv, pool: pool}
}

type resp struct {
	status int
	header http.Header
	body   map[string]any
	raw    string
}

type call struct {
	method, path string
	body         any
	rawBody      string
	bearer       string
	header       map[string]string
	client       *http.Client
}

func (e *env) do(t *testing.T, c call) resp {
	t.Helper()
	var r io.Reader = http.NoBody
	switch {
	case c.rawBody != "":
		r = strings.NewReader(c.rawBody)
	case c.body != nil:
		b, err := json.Marshal(c.body)
		if err != nil {
			t.Fatal(err)
		}
		r = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(context.Background(), c.method, e.srv.URL+c.path, r)
	if err != nil {
		t.Fatal(err)
	}
	if c.body != nil || c.rawBody != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.bearer != "" {
		req.Header.Set("Authorization", "Bearer "+c.bearer)
	}
	for k, v := range c.header {
		req.Header.Set(k, v)
	}
	client := c.client
	if client == nil {
		client = e.srv.Client()
	}
	res, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	out := resp{status: res.StatusCode, header: res.Header, raw: string(raw)}
	if len(raw) > 0 && strings.HasPrefix(res.Header.Get("Content-Type"), "application/json") {
		if err := json.Unmarshal(raw, &out.body); err != nil {
			t.Fatalf("response is not JSON: %v\n%s", err, raw)
		}
	}
	return out
}

func (e *env) devSignIn(t *testing.T, name, role string) (token string, userID string) {
	t.Helper()
	body := map[string]any{"name": name, "transport": "bearer"}
	if role != "" {
		body["role"] = role
	}
	r := e.do(t, call{method: "POST", path: "/api/auth/dev", body: body})
	if r.status != http.StatusOK {
		t.Fatalf("dev sign-in: %d %s", r.status, r.raw)
	}
	user, _ := r.body["user"].(map[string]any)
	token, _ = r.body["token"].(string)
	userID, _ = user["id"].(string)
	if token == "" || userID == "" {
		t.Fatalf("dev sign-in response: %s", r.raw)
	}
	return token, userID
}

// wantError — ошибка в формате договора: код, текст, id запроса, совпадающий с заголовком.
func wantError(t *testing.T, r resp, status int, code string) {
	t.Helper()
	if r.status != status {
		t.Fatalf("status = %d, want %d; body %s", r.status, status, r.raw)
	}
	if r.body["code"] != code {
		t.Fatalf("code = %v, want %q; body %s", r.body["code"], code, r.raw)
	}
	id, _ := r.body["requestId"].(string)
	if id == "" || id != r.header.Get("X-Request-Id") {
		t.Fatalf("requestId %q does not match header %q", id, r.header.Get("X-Request-Id"))
	}
}

func TestHealth(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	r := e.do(t, call{method: "GET", path: "/api/health"})
	if r.status != http.StatusOK || r.body["status"] != "ok" || r.body["version"] != "test-sha" {
		t.Fatalf("health: %d %s", r.status, r.raw)
	}
	if r.header.Get("X-Request-Id") == "" || r.header.Get("Cache-Control") != "no-store" || r.header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("headers: %v", r.header)
	}
}

func TestHealthWhenDatabaseIsDown(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	e.pool.Close()
	wantError(t, e.do(t, call{method: "GET", path: "/api/health"}), http.StatusServiceUnavailable, "internal")
}

func TestBearerSessionLifecycle(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	token, userID := e.devSignIn(t, "masha", "")

	me := e.do(t, call{method: "GET", path: "/api/me", bearer: token})
	if me.status != http.StatusOK || me.body["id"] != userID || me.body["role"] != "user" || me.body["locale"] != "ru" {
		t.Fatalf("me: %d %s", me.status, me.raw)
	}
	// Вход подменой — не способ входа человека: в списке привязанных его нет.
	if ids, _ := me.body["identities"].([]any); len(ids) != 0 {
		t.Fatalf("identities = %v, want none for dev sign-in", ids)
	}

	today := e.do(t, call{method: "GET", path: "/api/today", bearer: token})
	steps, _ := today.body["steps"].([]any)
	if today.status != http.StatusOK || len(steps) != 3 {
		t.Fatalf("today: %d %s", today.status, today.raw)
	}

	out := e.do(t, call{method: "POST", path: "/api/auth/logout", bearer: token})
	if out.status != http.StatusNoContent {
		t.Fatalf("logout: %d %s", out.status, out.raw)
	}
	wantError(t, e.do(t, call{method: "GET", path: "/api/me", bearer: token}), http.StatusUnauthorized, "unauthorized")
}

func TestSameDevNameIsSameUser(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	// Два первых входа одновременно — один аккаунт, а не два (гонка на уникальности способа входа).
	var wg sync.WaitGroup
	ids := make([]string, 8)
	for i := range ids {
		wg.Go(func() { _, ids[i] = e.devSignIn(t, "same", "") })
	}
	wg.Wait()
	for _, id := range ids[1:] {
		if id != ids[0] {
			t.Fatalf("parallel first sign-ins created different users: %v", ids)
		}
	}
}

func TestUnauthorized(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	cases := map[string]string{
		"no token":        "",
		"malformed token": "abc",
		"unknown token":   strings.Repeat("A", 43),
	}
	for name, token := range cases {
		t.Run(name, func(t *testing.T) {
			wantError(t, e.do(t, call{method: "GET", path: "/api/me", bearer: token}), http.StatusUnauthorized, "unauthorized")
		})
	}
}

func TestExpiredSession(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	token, _ := e.devSignIn(t, "masha", "")
	for _, col := range []string{"idle_expires_at", "absolute_expires_at"} {
		_, err := e.pool.Exec(context.Background(), "UPDATE sessions SET "+col+" = now() - interval '1 second'")
		if err != nil {
			t.Fatal(err)
		}
		wantError(t, e.do(t, call{method: "GET", path: "/api/me", bearer: token}), http.StatusUnauthorized, "unauthorized")
		if _, err := e.pool.Exec(context.Background(), "UPDATE sessions SET "+col+" = now() + interval '1 day'"); err != nil {
			t.Fatal(err)
		}
	}
	if r := e.do(t, call{method: "GET", path: "/api/me", bearer: token}); r.status != http.StatusOK {
		t.Fatalf("restored session: %d", r.status)
	}
}

func TestSessionIsTouched(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	token, _ := e.devSignIn(t, "masha", "")
	ctx := context.Background()
	if _, err := e.pool.Exec(ctx, "UPDATE sessions SET last_seen_at = now() - interval '2 hours', idle_expires_at = now() + interval '1 hour'"); err != nil {
		t.Fatal(err)
	}
	if r := e.do(t, call{method: "GET", path: "/api/me", bearer: token}); r.status != http.StatusOK {
		t.Fatalf("me: %d", r.status)
	}
	var idleLeft time.Duration
	if err := e.pool.QueryRow(ctx, "SELECT extract(epoch FROM idle_expires_at - now())::bigint * interval '1 second' FROM sessions").Scan(&idleLeft); err != nil {
		t.Fatal(err)
	}
	if idleLeft < 29*24*time.Hour {
		t.Fatalf("idle expiry not extended: %v left", idleLeft)
	}
}

func TestCookieSession(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	client := e.srv.Client()
	client.Jar = jar

	r := e.do(t, call{method: "POST", path: "/api/auth/dev", body: map[string]any{"name": "site", "transport": "cookie"}, client: client})
	if r.status != http.StatusOK {
		t.Fatalf("cookie sign-in: %d %s", r.status, r.raw)
	}
	if _, ok := r.body["token"]; ok {
		t.Fatal("cookie transport must not return the token in the body")
	}
	set := r.header.Get("Set-Cookie")
	for _, want := range []string{"__Host-session=", "Path=/", "HttpOnly", "Secure", "SameSite=Strict"} {
		if !strings.Contains(set, want) {
			t.Fatalf("Set-Cookie %q lacks %q", set, want)
		}
	}
	if strings.Contains(set, "Domain=") {
		t.Fatalf("__Host- cookie must not have Domain: %q", set)
	}
	if me := e.do(t, call{method: "GET", path: "/api/me", client: client}); me.status != http.StatusOK {
		t.Fatalf("me with cookie: %d %s", me.status, me.raw)
	}

	// Подделка с чужого сайта: браузер приложил бы куку, но запрос отклоняется.
	evil := e.do(t, call{method: "POST", path: "/api/auth/logout", client: client, header: map[string]string{"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"}})
	wantError(t, evil, http.StatusForbidden, "forbidden")
	if me := e.do(t, call{method: "GET", path: "/api/me", client: client}); me.status != http.StatusOK {
		t.Fatalf("session must survive a cross-site logout attempt: %d", me.status)
	}

	out := e.do(t, call{method: "POST", path: "/api/auth/logout", client: client, header: map[string]string{"Sec-Fetch-Site": "same-origin"}})
	if out.status != http.StatusNoContent || !strings.Contains(out.header.Get("Set-Cookie"), "Max-Age=0") {
		t.Fatalf("logout: %d, Set-Cookie %q", out.status, out.header.Get("Set-Cookie"))
	}
	wantError(t, e.do(t, call{method: "GET", path: "/api/me", client: client}), http.StatusUnauthorized, "unauthorized")
}

func TestStrictInput(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	cases := map[string]string{
		"unknown field":      `{"name":"x","transport":"bearer","admin":true}`,
		"wrong enum":         `{"name":"x","transport":"carrier-pigeon"}`,
		"missing required":   `{"transport":"bearer"}`,
		"too long":           `{"name":"` + strings.Repeat("x", 65) + `","transport":"bearer"}`,
		"not json":           `{"name":`,
		"wrong type":         `{"name":5,"transport":"bearer"}`,
		"role not in schema": `{"name":"x","transport":"bearer","role":"root"}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			wantError(t, e.do(t, call{method: "POST", path: "/api/auth/dev", rawBody: body}), http.StatusBadRequest, "bad_request")
		})
	}
	t.Run("body over the limit", func(t *testing.T) {
		big := `{"name":"x","transport":"bearer","pad":"` + strings.Repeat("x", 70<<10) + `"}`
		r := e.do(t, call{method: "POST", path: "/api/auth/dev", rawBody: big})
		if r.status < 400 || r.status >= 500 {
			t.Fatalf("status = %d, want 4xx", r.status)
		}
	})
}

func TestUnknownPathAndMethod(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	wantError(t, e.do(t, call{method: "GET", path: "/api/nope"}), http.StatusNotFound, "not_found")
	r := e.do(t, call{method: "DELETE", path: "/api/me"})
	wantError(t, r, http.StatusMethodNotAllowed, "bad_request")
}

func TestDevAuthOff(t *testing.T) {
	t.Parallel()
	for name, mutate := range map[string]func(*config.Config){
		"flag off": func(c *config.Config) { c.DevAuth = false },
		// Даже если флаг как-то просочился в бой мимо проверки конфигурации — путь закрыт.
		"production": func(c *config.Config) { c.Env = config.EnvProduction },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			e := newEnv(t, mutate)
			r := e.do(t, call{method: "POST", path: "/api/auth/dev", body: map[string]any{"name": "x", "transport": "bearer"}})
			wantError(t, r, http.StatusNotFound, "not_found")
		})
	}
}

func TestAdminOnly(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	user, _ := e.devSignIn(t, "user", "")
	wantError(t, e.do(t, call{method: "GET", path: "/api/admin/review-queue", bearer: user}), http.StatusForbidden, "forbidden")
	wantError(t, e.do(t, call{method: "GET", path: "/api/admin/review-queue"}), http.StatusUnauthorized, "unauthorized")

	admin, _ := e.devSignIn(t, "dasha", "admin")
	r := e.do(t, call{method: "GET", path: "/api/admin/review-queue", bearer: admin})
	if items, ok := r.body["items"].([]any); r.status != http.StatusOK || !ok || len(items) != 0 {
		t.Fatalf("admin queue: %d %s", r.status, r.raw)
	}
}

func TestClientErrors(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	token, userID := e.devSignIn(t, "masha", "")
	report := map[string]any{
		"message": "TypeError: x is undefined", "stack": "at a.js:1", "route": "/today",
		"clientKind": "telegram", "appVersion": "1.0.0", "occurredAt": time.Now().UTC().Format(time.RFC3339),
	}
	for name, bearer := range map[string]string{"signed in": token, "anonymous": "", "stale token": strings.Repeat("B", 43)} {
		r := e.do(t, call{method: "POST", path: "/api/client-errors", body: report, bearer: bearer})
		if r.status != http.StatusNoContent {
			t.Fatalf("%s: %d %s", name, r.status, r.raw)
		}
	}
	var total, withUser int
	err := e.pool.QueryRow(context.Background(), "SELECT count(*), count(*) FILTER (WHERE user_id = $1) FROM client_errors", userID).Scan(&total, &withUser)
	if err != nil {
		t.Fatal(err)
	}
	if total != 3 || withUser != 1 {
		t.Fatalf("client_errors: total %d, with user %d; want 3 and 1", total, withUser)
	}
}

func TestRateLimit(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	var limited resp
	for i := range 15 {
		limited = e.do(t, call{method: "POST", path: "/api/auth/dev", body: map[string]any{"name": "x" + strconv.Itoa(i), "transport": "bearer"}})
		if limited.status == http.StatusTooManyRequests {
			break
		}
	}
	wantError(t, limited, http.StatusTooManyRequests, "too_many_requests")
	if limited.header.Get("Retry-After") == "" {
		t.Fatal("429 without Retry-After")
	}
	// Остальной API ограничение не задевает.
	if r := e.do(t, call{method: "GET", path: "/api/health"}); r.status != http.StatusOK {
		t.Fatalf("health after limit: %d", r.status)
	}
}

func signedInitData(t *testing.T, user string, authDate time.Time) string {
	t.Helper()
	fields := map[string]string{"auth_date": strconv.FormatInt(authDate.Unix(), 10), "user": user, "query_id": "AAH"}
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
	mac := hmac.New(sha256.New, []byte("WebAppData"))
	mac.Write([]byte(botToken))
	sum := hmac.New(sha256.New, mac.Sum(nil))
	sum.Write([]byte(strings.Join(pairs, "\n")))
	v.Set("hash", hex.EncodeToString(sum.Sum(nil)))
	return v.Encode()
}

func TestTelegramMiniAppSignIn(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	data := signedInitData(t, `{"id":42,"first_name":"Маша","language_code":"en"}`, time.Now().Add(-time.Minute))

	first := e.do(t, call{method: "POST", path: "/api/auth/telegram-mini-app", body: map[string]any{"initData": data}})
	if first.status != http.StatusOK {
		t.Fatalf("mini-app sign-in: %d %s", first.status, first.raw)
	}
	user, _ := first.body["user"].(map[string]any)
	if user["name"] != "Маша" || user["locale"] != "en" {
		t.Fatalf("user = %v", user)
	}
	ids, _ := user["identities"].([]any)
	if len(ids) != 1 || ids[0].(map[string]any)["provider"] != "telegram" {
		t.Fatalf("identities = %v", ids)
	}
	second := e.do(t, call{method: "POST", path: "/api/auth/telegram-mini-app", body: map[string]any{"initData": data}})
	if second.body["user"].(map[string]any)["id"] != user["id"] {
		t.Fatal("the same Telegram user got a second account")
	}
	if second.body["token"] == first.body["token"] {
		t.Fatal("each sign-in must get its own session token")
	}

	stale := signedInitData(t, `{"id":42}`, time.Now().Add(-2*time.Hour))
	wantError(t, e.do(t, call{method: "POST", path: "/api/auth/telegram-mini-app", body: map[string]any{"initData": stale}}), http.StatusUnauthorized, "invalid_init_data")
	forged := strings.Replace(data, "42", "43", 1)
	wantError(t, e.do(t, call{method: "POST", path: "/api/auth/telegram-mini-app", body: map[string]any{"initData": forged}}), http.StatusUnauthorized, "invalid_init_data")
}

func TestProviderUnavailable(t *testing.T) {
	t.Parallel()
	e := newEnv(t, nil)
	r := e.do(t, call{method: "POST", path: "/api/auth/oidc", body: map[string]any{
		"provider": "apple", "idToken": "x", "nonce": "nonce-0123456789abcdef", "transport": "bearer",
	}})
	wantError(t, r, http.StatusServiceUnavailable, "provider_unavailable")
}

// Вход через провайдера (Apple, Google, Telegram вне мини-аппа): тот же путь, что в бою, но провайдер
// подменный. Заодно правило привязки: новый способ входа сам к чужому аккаунту не прирастает.
func TestOIDCSignIn(t *testing.T) {
	t.Parallel()
	apple := oidctest.New(t)
	telegram := oidctest.New(t)
	e := newEnv(t, func(c *config.Config) {
		c.Apple = apple.Config()
		c.Telegram = telegram.Config()
	})
	const nonce = "nonce-0123456789abcdef"

	r := e.do(t, call{method: "POST", path: "/api/auth/oidc", body: map[string]any{
		"provider": "apple", "idToken": apple.Token(t, "app.bundle", "apple-1", nonce, nil),
		"nonce": nonce, "transport": "bearer", "displayName": "Маша",
	}})
	if r.status != http.StatusOK {
		t.Fatalf("apple sign-in: %d %s", r.status, r.raw)
	}
	appleUser := r.body["user"].(map[string]any)
	if appleUser["name"] != "Маша" {
		t.Fatalf("name from displayName: %v", appleUser["name"])
	}

	// Тот же человек в мини-аппе — отдельный аккаунт, пока он сам не привяжет Apple в настройках.
	mini := e.do(t, call{method: "POST", path: "/api/auth/telegram-mini-app", body: map[string]any{
		"initData": signedInitData(t, `{"id":42,"first_name":"Маша"}`, time.Now()),
	}})
	if mini.body["user"].(map[string]any)["id"] == appleUser["id"] {
		t.Fatal("accounts were merged without an explicit link")
	}

	// Вход через Telegram по коду (сайт, приложения) попадает в тот же аккаунт, что мини-апп: id совпадает.
	telegram.CodeToken.Store(telegram.Token(t, "web.services", "opaque", "", map[string]any{"id": 42}))
	code := e.do(t, call{method: "POST", path: "/api/auth/oidc/code", body: map[string]any{
		"provider": "telegram", "code": oidctest.GoodCode, "codeVerifier": strings.Repeat("v", 43),
		"redirectUri": "https://app.example/auth/callback", "transport": "cookie",
	}})
	if code.status != http.StatusOK || !strings.Contains(code.header.Get("Set-Cookie"), "__Host-session=") {
		t.Fatalf("code sign-in: %d %s (Set-Cookie %q)", code.status, code.raw, code.header.Get("Set-Cookie"))
	}
	if code.body["user"].(map[string]any)["id"] != mini.body["user"].(map[string]any)["id"] {
		t.Fatal("Telegram login on the site must land in the mini-app account")
	}

	bad := e.do(t, call{method: "POST", path: "/api/auth/oidc", body: map[string]any{
		"provider": "apple", "idToken": apple.Token(t, "someone.else", "x", nonce, nil), "nonce": nonce, "transport": "bearer",
	}})
	wantError(t, bad, http.StatusUnauthorized, "invalid_id_token")
	foreign := e.do(t, call{method: "POST", path: "/api/auth/oidc/code", body: map[string]any{
		"provider": "telegram", "code": oidctest.GoodCode, "codeVerifier": strings.Repeat("v", 43),
		"redirectUri": "https://evil.example/cb", "transport": "bearer",
	}})
	wantError(t, foreign, http.StatusBadRequest, "bad_request")
}

// Язык нового аккаунта вне мини-аппа — тот, что выбрал клиент по языку устройства (сайт: русский, кроме
// английского браузера без русского — решение Даши 06.10.2026). У существующего аккаунта вход язык не меняет.
func TestSignInLocale(t *testing.T) {
	t.Parallel()
	google := oidctest.New(t)
	telegram := oidctest.New(t)
	e := newEnv(t, func(c *config.Config) {
		c.Google = google.Config()
		c.Telegram = telegram.Config()
	})
	locale := func(r resp) any {
		t.Helper()
		if r.status != http.StatusOK {
			t.Fatalf("sign-in: %d %s", r.status, r.raw)
		}
		return r.body["user"].(map[string]any)["locale"]
	}

	dev := func(name string, extra map[string]any) resp {
		body := map[string]any{"name": name, "transport": "bearer"}
		maps.Copy(body, extra)
		return e.do(t, call{method: "POST", path: "/api/auth/dev", body: body})
	}
	if got := locale(dev("locale-en", map[string]any{"locale": "en"})); got != "en" {
		t.Fatalf("new account with locale en: %v", got)
	}
	if got := locale(dev("locale-en", map[string]any{"locale": "ru"})); got != "en" {
		t.Fatalf("existing account must keep its locale, got %v", got)
	}
	if got := locale(dev("locale-default", nil)); got != "ru" {
		t.Fatalf("no locale — Russian by default, got %v", got)
	}
	wantError(t, dev("locale-bad", map[string]any{"locale": "de"}), http.StatusBadRequest, "bad_request")

	const nonce = "nonce-0123456789abcdef"
	idToken := e.do(t, call{method: "POST", path: "/api/auth/oidc", body: map[string]any{
		"provider": "google", "idToken": google.Token(t, "web.services", "google-locale", nonce, nil),
		"nonce": nonce, "transport": "bearer", "locale": "en",
	}})
	if got := locale(idToken); got != "en" {
		t.Fatalf("id_token sign-in with locale en: %v", got)
	}

	telegram.CodeToken.Store(telegram.Token(t, "web.services", "opaque", nonce, map[string]any{"id": 77}))
	code := e.do(t, call{method: "POST", path: "/api/auth/oidc/code", body: map[string]any{
		"provider": "telegram", "code": oidctest.GoodCode, "codeVerifier": strings.Repeat("v", 43),
		"redirectUri": "https://app.example/auth/callback", "nonce": nonce, "transport": "bearer", "locale": "en",
	}})
	if got := locale(code); got != "en" {
		t.Fatalf("code sign-in with locale en: %v", got)
	}
}
