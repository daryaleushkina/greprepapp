package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/daryaleushkina/greprepapp/server/internal/config"
)

var (
	// ErrInvalidIDToken — id_token не прошёл проверку (подпись, издатель, получатель, срок, nonce).
	ErrInvalidIDToken = errors.New("invalid id token")
	// ErrProviderUnavailable — провайдер не настроен или его ключи сейчас не получить.
	ErrProviderUnavailable = errors.New("identity provider unavailable")
	// ErrRedirectNotAllowed — адрес возврата не из зарегистрированных у провайдера.
	ErrRedirectNotAllowed = errors.New("redirect uri not allowed")
)

// Identity — проверенный способ входа: провайдер и неизменный id человека у него.
type Identity struct {
	Provider string
	Subject  string
	Name     string
}

// outboundTimeout — срок любого запроса наружу (ключи провайдера, обмен кода). CLAUDE.md: каждый запрос
// наружу — с context и сроком.
const outboundTimeout = 10 * time.Second

// OIDC проверяет вход через Telegram, Apple и Google. Ключи провайдеров (JWKS) go-oidc держит в памяти и
// перечитывает, когда встречает незнакомый ключ.
type OIDC struct {
	client    *http.Client
	providers map[string]*oidcProvider
}

type oidcProvider struct {
	name string
	cfg  config.Provider

	mu       sync.Mutex
	provider *oidc.Provider
	// verifier создаётся один раз: у него общий кэш ключей. VerifierContext заводил бы новый кэш на
	// каждый вход и каждый раз скачивал ключи заново.
	verifier *oidc.IDTokenVerifier
}

// NewOIDC — проверка для настроенных провайдеров. Сеть при создании не трогается: адреса ключей
// получаются при первом входе, чтобы недоступный провайдер не мешал серверу стартовать.
func NewOIDC(client *http.Client, telegram, apple, google config.Provider) *OIDC {
	if client == nil {
		client = &http.Client{Timeout: outboundTimeout}
	}
	o := &OIDC{client: client, providers: map[string]*oidcProvider{}}
	for name, cfg := range map[string]config.Provider{"telegram": telegram, "apple": apple, "google": google} {
		if cfg.Enabled() {
			o.providers[name] = &oidcProvider{name: name, cfg: cfg}
		}
	}
	return o
}

// discover — описание провайдера (/.well-known/openid-configuration). Неудача не запоминается:
// следующий вход попробует снова.
func (o *OIDC) discover(ctx context.Context, name string) (*oidcProvider, *oidc.Provider, error) {
	p, ok := o.providers[name]
	if !ok {
		return nil, nil, fmt.Errorf("%w: %s is not configured", ErrProviderUnavailable, name)
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.provider != nil {
		return p, p.provider, nil
	}
	// Загрузка описания — со сроком и отменой вместе с запросом. Ключи go-oidc потом грузит со своим
	// фоновым контекстом и тем же HTTP-клиентом (он берётся из контекста здесь).
	dctx, cancel := context.WithTimeout(oidc.ClientContext(ctx, o.client), outboundTimeout)
	defer cancel()
	prov, err := oidc.NewProvider(dctx, p.cfg.Issuer)
	if err != nil {
		return nil, nil, fmt.Errorf("%w: discover %s: %w", ErrProviderUnavailable, name, err)
	}
	// Получателей у провайдера несколько (у Apple — bundle ID приложения и Services ID сайта), поэтому
	// встроенная проверка одного client ID выключена и делается в verify по списку.
	p.provider = prov
	p.verifier = prov.Verifier(&oidc.Config{SkipClientIDCheck: true})
	return p, prov, nil
}

// VerifyIDToken проверяет id_token, полученный клиентом на устройстве (родная кнопка Apple,
// Credential Manager Google). nonce обязателен: без него перехваченный токен можно предъявить повторно.
func (o *OIDC) VerifyIDToken(ctx context.Context, provider, rawIDToken, nonce string) (Identity, error) {
	if nonce == "" {
		return Identity{}, fmt.Errorf("%w: nonce is required", ErrInvalidIDToken)
	}
	return o.verify(ctx, provider, rawIDToken, nonce)
}

// ExchangeCode меняет код авторизации на id_token (PKCE) и проверяет его. Секрет клиента живёт только
// на сервере. nonce — если клиент его посылал.
func (o *OIDC) ExchangeCode(ctx context.Context, provider, code, codeVerifier, redirectURI, nonce string) (Identity, error) {
	p, prov, err := o.discover(ctx, provider)
	if err != nil {
		return Identity{}, err
	}
	if !slices.Contains(p.cfg.RedirectURIs, redirectURI) {
		return Identity{}, fmt.Errorf("%w: %q", ErrRedirectNotAllowed, redirectURI)
	}
	conf := oauth2.Config{
		ClientID:     p.cfg.ClientID,
		ClientSecret: p.cfg.ClientSecret,
		Endpoint:     prov.Endpoint(),
		RedirectURL:  redirectURI,
		Scopes:       []string{oidc.ScopeOpenID},
	}
	ectx, cancel := context.WithTimeout(context.WithValue(ctx, oauth2.HTTPClient, o.client), outboundTimeout)
	defer cancel()
	tok, err := conf.Exchange(ectx, code, oauth2.VerifierOption(codeVerifier))
	if err != nil {
		return Identity{}, fmt.Errorf("%w: exchange code with %s: %w", ErrInvalidIDToken, provider, err)
	}
	raw, ok := tok.Extra("id_token").(string)
	if !ok || raw == "" {
		return Identity{}, fmt.Errorf("%w: %s returned no id_token", ErrInvalidIDToken, provider)
	}
	return o.verify(ctx, provider, raw, nonce)
}

func (o *OIDC) verify(ctx context.Context, provider, rawIDToken, nonce string) (Identity, error) {
	p, _, err := o.discover(ctx, provider)
	if err != nil {
		return Identity{}, err
	}
	vctx, cancel := context.WithTimeout(ctx, outboundTimeout)
	defer cancel()
	tok, err := p.verifier.Verify(vctx, rawIDToken)
	if err != nil {
		return Identity{}, fmt.Errorf("%w: %s: %w", ErrInvalidIDToken, provider, err)
	}
	if !slices.ContainsFunc(tok.Audience, func(a string) bool { return slices.Contains(p.cfg.Audiences, a) }) {
		return Identity{}, fmt.Errorf("%w: %s: unexpected audience %v", ErrInvalidIDToken, provider, tok.Audience)
	}
	// go-oidc nonce не сверяет — это делает приложение (документация oidc.Config).
	if nonce != "" && tok.Nonce != nonce {
		return Identity{}, fmt.Errorf("%w: %s: nonce mismatch", ErrInvalidIDToken, provider)
	}
	var claims struct {
		Name              string `json:"name"`
		GivenName         string `json:"given_name"`
		FamilyName        string `json:"family_name"`
		PreferredUsername string `json:"preferred_username"`
		// id — Telegram id человека. По нему вход через Telegram попадает в тот же аккаунт, что и мини-апп
		// (initData знает только этот id). Совпадение с initData проверить на настоящем боте.
		TelegramID *int64 `json:"id"`
	}
	if err := tok.Claims(&claims); err != nil {
		return Identity{}, fmt.Errorf("%w: %s: claims: %w", ErrInvalidIDToken, provider, err)
	}
	subject := tok.Subject
	if provider == "telegram" {
		if claims.TelegramID == nil || *claims.TelegramID <= 0 {
			return Identity{}, fmt.Errorf("%w: telegram token without id", ErrInvalidIDToken)
		}
		subject = strconv.FormatInt(*claims.TelegramID, 10)
	}
	if subject == "" {
		return Identity{}, fmt.Errorf("%w: %s: empty subject", ErrInvalidIDToken, provider)
	}
	name := strings.TrimSpace(claims.Name)
	if name == "" {
		name = strings.TrimSpace(claims.GivenName + " " + claims.FamilyName)
	}
	if name == "" && claims.PreferredUsername != "" {
		name = "@" + claims.PreferredUsername
	}
	return Identity{Provider: provider, Subject: subject, Name: truncate(name, 128)}, nil
}
