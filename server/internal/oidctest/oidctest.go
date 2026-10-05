// Package oidctest — подменный провайдер OpenID Connect для тестов: описание, ключи и обмен кода, как
// у Telegram, Apple и Google, только на httptest.
package oidctest

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"maps"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"

	"github.com/daryaleushkina/greprepapp/server/internal/config"
)

// GoodCode — код авторизации, который подменный провайдер принимает.
const GoodCode = "good-code"

// Provider — провайдер OpenID Connect в памяти: описание, ключи и обмен кода, как у Telegram,
// Apple и Google, только на httptest.
type Provider struct {
	Srv    *httptest.Server
	key    *rsa.PrivateKey
	Signer jose.Signer
	// broken — описание отдаёт 500 (провайдер недоступен).
	Broken atomic.Bool
	// lastVerifier — code_verifier из последнего обмена кода (проверка PKCE).
	LastVerifier atomic.Value
	// codeToken — какой id_token отдать на обмен кода.
	CodeToken atomic.Value
}

func New(t testing.TB) *Provider {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: jose.JSONWebKey{Key: key, KeyID: "k1"}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	p := &Provider{key: key, Signer: signer}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		if p.Broken.Load() {
			http.Error(w, "down", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{
			"issuer":                                p.Srv.URL,
			"authorization_endpoint":                p.Srv.URL + "/auth",
			"token_endpoint":                        p.Srv.URL + "/token",
			"jwks_uri":                              p.Srv.URL + "/jwks",
			"id_token_signing_alg_values_supported": []string{"RS256"},
		})
	})
	mux.HandleFunc("GET /jwks", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "k1", Algorithm: "RS256", Use: "sig"}}})
	})
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad form", http.StatusBadRequest)
			return
		}
		if r.PostForm.Get("code") != GoodCode {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, map[string]string{"error": "invalid_grant"})
			return
		}
		p.LastVerifier.Store(r.PostForm.Get("code_verifier"))
		tok, _ := p.CodeToken.Load().(string)
		writeJSON(w, map[string]any{"access_token": "at", "token_type": "Bearer", "expires_in": 3600, "id_token": tok})
	})
	p.Srv = httptest.NewServer(mux)
	t.Cleanup(p.Srv.Close)
	return p
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v) // тестовый сервер: клиент ушёл — неважно
}

// token подписывает id_token. claims поверх стандартных: издатель — этот провайдер, срок — час.
func (p *Provider) Token(t testing.TB, aud, sub, nonce string, extra map[string]any) string {
	t.Helper()
	now := time.Now()
	std := jwt.Claims{
		Issuer:   p.Srv.URL,
		Subject:  sub,
		Audience: jwt.Audience{aud},
		IssuedAt: jwt.NewNumericDate(now),
		Expiry:   jwt.NewNumericDate(now.Add(time.Hour)),
	}
	custom := map[string]any{"nonce": nonce}
	maps.Copy(custom, extra)
	raw, err := jwt.Signed(p.Signer).Claims(std).Claims(custom).Serialize()
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func (p *Provider) Config() config.Provider {
	return config.Provider{
		Issuer:       p.Srv.URL,
		Audiences:    []string{"app.bundle", "web.services"},
		ClientID:     "web.services",
		ClientSecret: "secret",
		RedirectURIs: []string{"https://app.example/auth/callback"},
	}
}
