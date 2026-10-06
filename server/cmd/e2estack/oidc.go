package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
)

// fakeProvider — подменный провайдер OpenID Connect, один на Telegram, Apple и Google (у каждого свой
// client_id). Пускает любого, но протокол соблюдает всерьёз: только код с PKCE S256, код одноразовый и живёт
// минуту, адрес возврата и секрет клиента сверяются, id_token подписан и с nonce — иначе e2e не поймал бы
// ошибку в настоящем коде входа.
//
// Кто входит: login_hint в адресе входа (тест так задаёт одного и того же человека), иначе — новый человек
// на каждый вход. login_hint=deny — провайдер отвечает отказом (error=access_denied), как при «Отмена».
type fakeProvider struct {
	issuer string
	// redirects — зарегистрированные адреса возврата, как в панели настоящего провайдера; чужой — отказ.
	redirects []string
	key       *rsa.PrivateKey
	signer    jose.Signer

	mu     sync.Mutex
	grants map[string]grant
}

type grant struct {
	clientID, redirectURI, challenge, nonce, subject string
	expires                                          time.Time
}

const fakeClientSecret = "e2e-secret"

var fakeClients = map[string]bool{"e2e-telegram": true, "e2e-apple": true, "e2e-google": true}

func newFakeProvider(issuer string, redirects []string) (*fakeProvider, error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("generate key: %w", err)
	}
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: jose.JSONWebKey{Key: key, KeyID: "e2e"}}, nil)
	if err != nil {
		return nil, fmt.Errorf("signer: %w", err)
	}
	return &fakeProvider{issuer: issuer, redirects: redirects, key: key, signer: signer, grants: map[string]grant{}}, nil
}

func (p *fakeProvider) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"issuer":                                p.issuer,
			"authorization_endpoint":                p.issuer + "/auth",
			"token_endpoint":                        p.issuer + "/token",
			"jwks_uri":                              p.issuer + "/jwks",
			"response_types_supported":              []string{"code"},
			"subject_types_supported":               []string{"public"},
			"id_token_signing_alg_values_supported": []string{"RS256"},
			"code_challenge_methods_supported":      []string{"S256"},
		})
	})
	mux.HandleFunc("GET /jwks", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, jose.JSONWebKeySet{Keys: []jose.JSONWebKey{
			{Key: &p.key.PublicKey, KeyID: "e2e", Algorithm: "RS256", Use: "sig"},
		}})
	})
	mux.HandleFunc("GET /auth", p.authorize)
	mux.HandleFunc("POST /token", p.token)
	return mux
}

// authorize — «страница входа» провайдера: сразу возвращает человека на сайт с кодом.
func (p *fakeProvider) authorize(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	// Возврат — только на зарегистрированный адрес, и берётся он из своего списка, а не из запроса.
	registered := ""
	for _, uri := range p.redirects {
		if uri == q.Get("redirect_uri") {
			registered = uri
		}
	}
	redirect, err := url.Parse(registered)
	if registered == "" || err != nil {
		http.Error(w, "redirect_uri is not registered", http.StatusBadRequest)
		return
	}
	switch {
	case q.Get("response_type") != "code":
		http.Error(w, "only response_type=code", http.StatusBadRequest)
		return
	case !fakeClients[q.Get("client_id")]:
		http.Error(w, "unknown client_id", http.StatusBadRequest)
		return
	case q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "":
		http.Error(w, "PKCE S256 is required", http.StatusBadRequest)
		return
	case q.Get("state") == "":
		http.Error(w, "state is required", http.StatusBadRequest)
		return
	}
	back := redirect.Query()
	back.Set("state", q.Get("state"))
	if q.Get("login_hint") == "deny" {
		back.Set("error", "access_denied")
		redirect.RawQuery = back.Encode()
		http.Redirect(w, r, redirect.String(), http.StatusFound)
		return
	}
	subject := q.Get("login_hint")
	if subject == "" {
		subject = randomTelegramID()
	}
	code := randomString()
	p.mu.Lock()
	p.grants[code] = grant{
		clientID: q.Get("client_id"), redirectURI: q.Get("redirect_uri"), challenge: q.Get("code_challenge"),
		nonce: q.Get("nonce"), subject: subject, expires: time.Now().Add(time.Minute),
	}
	p.mu.Unlock()
	back.Set("code", code)
	redirect.RawQuery = back.Encode()
	http.Redirect(w, r, redirect.String(), http.StatusFound)
}

// token — обмен кода на id_token, его делает сервер API (golang.org/x/oauth2).
func (p *fakeProvider) token(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		oauthError(w, "invalid_request")
		return
	}
	clientID, secret, ok := r.BasicAuth()
	if !ok {
		clientID, secret = r.PostForm.Get("client_id"), r.PostForm.Get("client_secret")
	}
	if !fakeClients[clientID] || secret != fakeClientSecret {
		oauthError(w, "invalid_client")
		return
	}
	code := r.PostForm.Get("code")
	p.mu.Lock()
	g, found := p.grants[code]
	delete(p.grants, code) // код одноразовый
	p.mu.Unlock()
	sum := sha256.Sum256([]byte(r.PostForm.Get("code_verifier")))
	switch {
	case r.PostForm.Get("grant_type") != "authorization_code", !found, time.Now().After(g.expires),
		g.clientID != clientID, g.redirectURI != r.PostForm.Get("redirect_uri"),
		base64.RawURLEncoding.EncodeToString(sum[:]) != g.challenge:
		oauthError(w, "invalid_grant")
		return
	}
	now := time.Now()
	claims := map[string]any{"name": "E2E " + strings.TrimPrefix(clientID, "e2e-")}
	if g.nonce != "" {
		claims["nonce"] = g.nonce
	}
	// Telegram отдаёт id человека числом (claim id) — по нему сайт попадает в аккаунт мини-аппа.
	if clientID == "e2e-telegram" {
		id, ok := new(big.Int).SetString(g.subject, 10)
		if !ok || !id.IsInt64() {
			oauthError(w, "invalid_grant")
			return
		}
		claims["id"] = id.Int64()
	}
	raw, err := jwt.Signed(p.signer).Claims(jwt.Claims{
		Issuer: p.issuer, Subject: g.subject, Audience: jwt.Audience{clientID},
		IssuedAt: jwt.NewNumericDate(now), Expiry: jwt.NewNumericDate(now.Add(time.Hour)),
	}).Claims(claims).Serialize()
	if err != nil {
		http.Error(w, "sign: "+err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"access_token": randomString(), "token_type": "Bearer", "expires_in": 3600, "id_token": raw})
}

func oauthError(w http.ResponseWriter, code string) {
	writeJSON(w, http.StatusBadRequest, map[string]string{"error": code})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// Статус уже отправлен; сервер API увидит оборванный ответ как ошибку обмена кода.
		fmt.Fprintln(os.Stderr, "e2estack: write response:", err)
	}
}

func randomString() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b) // crypto/rand.Read не возвращает ошибку (Go 1.24+)
	return base64.RawURLEncoding.EncodeToString(b)
}

// randomTelegramID — id из далёкого диапазона, чтобы не совпасть с id из initData фикстур.
func randomTelegramID() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(1_000_000_000)) // crypto/rand.Int падает только на max <= 0
	return fmt.Sprint(9_000_000_000_000 + n.Int64())
}
