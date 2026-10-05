// Package httpx — обвязка HTTP вокруг сгенерированного сервера: id запроса, журнал (одна строка на
// запрос), перехват паники, заголовки безопасности, предел размера тела, защита от подделки запросов
// с чужих сайтов и ограничение частоты.
package httpx

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// RequestIDHeader — заголовок с id запроса в каждом ответе; тот же id — в журнале и в теле ошибки.
const RequestIDHeader = "X-Request-Id"

// Info — что известно о запросе по ходу обработки; журнал пишет это одной строкой в конце.
type Info struct {
	ID string

	mu     sync.Mutex
	userID string
}

// SetUser — кто вошёл (ставит проверка сессии); id пользователя попадает в строку журнала.
func (i *Info) SetUser(id string) {
	i.mu.Lock()
	i.userID = id
	i.mu.Unlock()
}

func (i *Info) user() string {
	i.mu.Lock()
	defer i.mu.Unlock()
	return i.userID
}

type infoKey struct{}

// FromContext — сведения о текущем запросе. Вне запроса — пустые, не nil.
func FromContext(ctx context.Context) *Info {
	if i, ok := ctx.Value(infoKey{}).(*Info); ok {
		return i
	}
	return &Info{}
}

// WithInfo кладёт сведения о запросе в контекст (для тестов обработчиков без HTTP).
func WithInfo(ctx context.Context, i *Info) context.Context {
	return context.WithValue(ctx, infoKey{}, i)
}

func newRequestID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b) // crypto/rand.Read не возвращает ошибку с Go 1.24
	return hex.EncodeToString(b)
}

// recorder запоминает статус и размер ответа для журнала. Unwrap нужен http.ResponseController
// (сброс буфера, сроки записи) — без него обёртка их прячет.
type recorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *recorder) WriteHeader(code int) {
	if r.status == 0 {
		r.status = code
	}
	r.ResponseWriter.WriteHeader(code)
}

func (r *recorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	n, err := r.ResponseWriter.Write(b)
	r.bytes += n
	if err != nil {
		return n, fmt.Errorf("write response: %w", err)
	}
	return n, nil
}

func (r *recorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

// Log — id запроса и одна строка журнала на запрос: метод, путь без строки запроса (в ней могут быть
// личные данные), статус, размер, длительность, пользователь. Токены, куки и initData не пишутся никогда.
func Log(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		info := &Info{ID: newRequestID()}
		w.Header().Set(RequestIDHeader, info.ID)
		rec := &recorder{ResponseWriter: w}
		next.ServeHTTP(rec, r.WithContext(WithInfo(r.Context(), info)))
		status := rec.status
		if status == 0 {
			status = http.StatusOK
		}
		level := slog.LevelInfo
		if status >= http.StatusInternalServerError {
			level = slog.LevelError
		}
		logger.LogAttrs(r.Context(), level, "request",
			slog.String("request_id", info.ID),
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Int("status", status),
			slog.Int("bytes", rec.bytes),
			slog.Duration("duration", time.Since(start)),
			slog.String("user_id", info.user()),
		)
	})
}

// Recover превращает панику в ответ 500 и строку журнала со стеком, а не в оборванное соединение.
func Recover(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func(ctx context.Context) {
			if v := recover(); v != nil {
				// ErrAbortHandler — штатный обрыв ответа: net/http ждёт эту панику и сам её гасит.
				if err, ok := v.(error); ok && errors.Is(err, http.ErrAbortHandler) {
					panic(v)
				}
				logger.LogAttrs(ctx, slog.LevelError, "panic",
					slog.String("request_id", FromContext(ctx).ID),
					slog.Any("panic", v),
					slog.String("stack", string(debug.Stack())),
				)
				WriteError(w, r, http.StatusInternalServerError, "internal", "internal error")
			}
		}(r.Context())
		next.ServeHTTP(w, r)
	})
}

// SecureHeaders — заголовки, которые нужны любому ответу API: не угадывать тип, не кэшировать
// личное, не встраивать в чужие страницы.
func SecureHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Cache-Control", "no-store")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}

// MaxBody — предел тела запроса: больше в наш API ничего не шлёт, а без предела одно тело занимает
// память сервера.
func MaxBody(limit int64, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		next.ServeHTTP(w, r)
	})
}

// CrossOrigin отклоняет изменяющие запросы с чужих сайтов (Sec-Fetch-Site, иначе Origin) — защита
// от подделки запросов для куки сайта (OWASP CSRF Cheat Sheet называет этот способ допустимым).
// Приложения и мини-апп ходят с заголовком Authorization, без Origin, — их это не задевает.
func CrossOrigin(next http.Handler) http.Handler {
	p := http.NewCrossOriginProtection()
	p.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		WriteError(w, r, http.StatusForbidden, "forbidden", "cross-origin request")
	}))
	return p.Handler(next)
}

// Limiter — ограничение частоты по адресу клиента для дорогих и открытых путей (вход, ошибки клиентов).
// Память ограничена: при переполнении таблица начинается заново — честнее, чем расти без конца.
type Limiter struct {
	rate  rate.Limit
	burst int

	mu      sync.Mutex
	clients map[string]*rate.Limiter
}

const maxLimiterClients = 10_000

// NewLimiter — perMinute запросов в минуту с запасом burst.
func NewLimiter(perMinute float64, burst int) *Limiter {
	return &Limiter{rate: rate.Limit(perMinute / 60), burst: burst, clients: map[string]*rate.Limiter{}}
}

func (l *Limiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	lim, ok := l.clients[key]
	if !ok {
		if len(l.clients) >= maxLimiterClients {
			l.clients = map[string]*rate.Limiter{}
		}
		lim = rate.NewLimiter(l.rate, l.burst)
		l.clients[key] = lim
	}
	return lim.Allow()
}

// Limit применяет ограничение к путям с данными префиксами.
func (l *Limiter) Limit(prefixes []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for _, p := range prefixes {
			if strings.HasPrefix(r.URL.Path, p) {
				if !l.allow(ClientIP(r)) {
					w.Header().Set("Retry-After", "60")
					WriteError(w, r, http.StatusTooManyRequests, "too_many_requests", "rate limit")
					return
				}
				break
			}
		}
		next.ServeHTTP(w, r)
	})
}

// ClientIP — адрес клиента. Сервер слушает только 127.0.0.1 за Caddy, и Caddy (без trusted_proxies)
// заменяет X-Forwarded-For адресом клиента, поэтому верим заголовку, только когда запрос пришёл с
// локального адреса.
func ClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.Split(xff, ",")
			if last := strings.TrimSpace(parts[len(parts)-1]); net.ParseIP(last) != nil {
				return last
			}
		}
	}
	return host
}
