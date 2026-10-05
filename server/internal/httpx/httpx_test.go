package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRecoverWritesContractError(t *testing.T) {
	t.Parallel()
	log := slog.New(slog.DiscardHandler)
	h := Log(log, Recover(log, http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") })))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/x", nil))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["code"] != "internal" || body["requestId"] == "" || body["requestId"] != rec.Header().Get(RequestIDHeader) {
		t.Fatalf("body = %v, header id = %q", body, rec.Header().Get(RequestIDHeader))
	}
	if strings.Contains(rec.Body.String(), "boom") {
		t.Fatal("panic value leaked to the client")
	}
}

func TestRecoverRepanicsAbortHandler(t *testing.T) {
	t.Parallel()
	h := Recover(slog.New(slog.DiscardHandler), http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic(http.ErrAbortHandler) }))
	defer func() {
		err, ok := recover().(error)
		if !ok || !errors.Is(err, http.ErrAbortHandler) {
			t.Fatalf("recovered %v, want http.ErrAbortHandler re-panicked", err)
		}
	}()
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
}

func TestLogLine(t *testing.T) {
	t.Parallel()
	var buf strings.Builder
	log := slog.New(slog.NewJSONHandler(&buf, nil))
	h := Log(log, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		FromContext(r.Context()).SetUser("user-1")
		w.WriteHeader(http.StatusTeapot)
		_, _ = io.WriteString(w, "hi")
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/me?token=secret", nil))
	var line map[string]any
	if err := json.Unmarshal([]byte(buf.String()), &line); err != nil {
		t.Fatalf("log line is not JSON: %v\n%s", err, buf.String())
	}
	if line["status"] != float64(418) || line["bytes"] != float64(2) || line["user_id"] != "user-1" || line["path"] != "/api/me" || line["request_id"] == "" {
		t.Fatalf("log line = %v", line)
	}
	if strings.Contains(buf.String(), "secret") {
		t.Fatal("query string leaked into the log")
	}
}

func TestRecorderUnwrapKeepsFlush(t *testing.T) {
	t.Parallel()
	h := Log(slog.New(slog.DiscardHandler), http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if err := http.NewResponseController(w).Flush(); err != nil {
			t.Errorf("flush through the log wrapper: %v", err)
		}
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if !rec.Flushed {
		t.Fatal("not flushed")
	}
}

func TestClientIP(t *testing.T) {
	t.Parallel()
	cases := []struct {
		remote, xff, want string
	}{
		{"203.0.113.5:1234", "", "203.0.113.5"},
		// Подделанный заголовок напрямую, мимо Caddy, — не верим.
		{"203.0.113.5:1234", "1.2.3.4", "203.0.113.5"},
		// Через Caddy на 127.0.0.1 — берём последний адрес.
		{"127.0.0.1:5000", "10.0.0.1, 198.51.100.7", "198.51.100.7"},
		{"[::1]:5000", "198.51.100.7", "198.51.100.7"},
		{"127.0.0.1:5000", "garbage", "127.0.0.1"},
		{"no-port", "", "no-port"},
	}
	for _, c := range cases {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = c.remote
		if c.xff != "" {
			r.Header.Set("X-Forwarded-For", c.xff)
		}
		if got := ClientIP(r); got != c.want {
			t.Errorf("ClientIP(%q, %q) = %q, want %q", c.remote, c.xff, got, c.want)
		}
	}
}

func TestLimiterIsBounded(t *testing.T) {
	t.Parallel()
	l := NewLimiter(60, 1)
	for i := range maxLimiterClients + 5 {
		l.allow(string(rune(i)))
	}
	if n := len(l.clients); n > maxLimiterClients {
		t.Fatalf("limiter grew to %d entries", n)
	}
	if !l.allow("fresh") || l.allow("fresh") {
		t.Fatal("burst 1: first request allowed, second limited")
	}
}

func TestFromContextOutsideRequest(t *testing.T) {
	t.Parallel()
	if FromContext(t.Context()) == nil {
		t.Fatal("FromContext must not return nil")
	}
}
