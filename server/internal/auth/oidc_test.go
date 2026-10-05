package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4/jwt"

	"github.com/daryaleushkina/greprepapp/server/internal/config"
	"github.com/daryaleushkina/greprepapp/server/internal/oidctest"
)

const nonce = "nonce-0123456789abcdef"

func TestVerifyIDToken(t *testing.T) {
	t.Parallel()
	apple := oidctest.New(t)
	telegram := oidctest.New(t)
	o := NewOIDC(apple.Srv.Client(), telegram.Config(), apple.Config(), config.Provider{})
	ctx := context.Background()

	t.Run("valid apple token, second audience", func(t *testing.T) {
		t.Parallel()
		id, err := o.VerifyIDToken(ctx, "apple", apple.Token(t, "web.services", "apple-sub", nonce, map[string]any{"name": "Маша"}), nonce)
		if err != nil {
			t.Fatalf("VerifyIDToken: %v", err)
		}
		if id.Provider != "apple" || id.Subject != "apple-sub" || id.Name != "Маша" {
			t.Fatalf("identity = %+v", id)
		}
	})
	t.Run("name from given and family", func(t *testing.T) {
		t.Parallel()
		id, err := o.VerifyIDToken(ctx, "apple", apple.Token(t, "app.bundle", "s", nonce, map[string]any{"given_name": "Маша", "family_name": "Иванова"}), nonce)
		if err != nil || id.Name != "Маша Иванова" {
			t.Fatalf("identity = %+v, err = %v", id, err)
		}
	})
	t.Run("telegram subject is the telegram id", func(t *testing.T) {
		t.Parallel()
		id, err := o.VerifyIDToken(ctx, "telegram", telegram.Token(t, "app.bundle", "opaque-sub", nonce, map[string]any{"id": 42, "preferred_username": "masha"}), nonce)
		if err != nil {
			t.Fatalf("VerifyIDToken: %v", err)
		}
		if id.Subject != "42" || id.Name != "@masha" {
			t.Fatalf("identity = %+v", id)
		}
	})

	invalid := []struct {
		name, provider, token, nonce string
	}{
		{"wrong audience", "apple", apple.Token(t, "someone.else", "s", nonce, nil), nonce},
		{"wrong nonce", "apple", apple.Token(t, "app.bundle", "s", "other-nonce-0123456789", nil), nonce},
		{"no nonce in request", "apple", apple.Token(t, "app.bundle", "s", nonce, nil), ""},
		{"signed by another provider", "apple", telegram.Token(t, "app.bundle", "s", nonce, nil), nonce},
		{"garbage", "apple", "not.a.jwt", nonce},
		{"telegram without id", "telegram", telegram.Token(t, "app.bundle", "s", nonce, nil), nonce},
		{"empty subject", "apple", apple.Token(t, "app.bundle", "", nonce, nil), nonce},
	}
	for _, tc := range invalid {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := o.VerifyIDToken(ctx, tc.provider, tc.token, tc.nonce)
			if !errors.Is(err, ErrInvalidIDToken) {
				t.Fatalf("err = %v, want ErrInvalidIDToken", err)
			}
		})
	}

	t.Run("provider not configured", func(t *testing.T) {
		t.Parallel()
		_, err := o.VerifyIDToken(ctx, "google", "x", nonce)
		if !errors.Is(err, ErrProviderUnavailable) {
			t.Fatalf("err = %v, want ErrProviderUnavailable", err)
		}
	})
}

func TestExpiredIDToken(t *testing.T) {
	t.Parallel()
	p := oidctest.New(t)
	o := NewOIDC(p.Srv.Client(), config.Provider{}, p.Config(), config.Provider{})
	past := time.Now().Add(-2 * time.Hour)
	raw, err := jwt.Signed(p.Signer).Claims(jwt.Claims{
		Issuer: p.Srv.URL, Subject: "s", Audience: jwt.Audience{"app.bundle"},
		IssuedAt: jwt.NewNumericDate(past), Expiry: jwt.NewNumericDate(past.Add(time.Hour)),
	}).Claims(map[string]any{"nonce": nonce}).Serialize()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := o.VerifyIDToken(context.Background(), "apple", raw, nonce); !errors.Is(err, ErrInvalidIDToken) {
		t.Fatalf("err = %v, want ErrInvalidIDToken", err)
	}
}

func TestDiscoveryFailureIsRetried(t *testing.T) {
	t.Parallel()
	p := oidctest.New(t)
	o := NewOIDC(p.Srv.Client(), config.Provider{}, p.Config(), config.Provider{})
	p.Broken.Store(true)
	if _, err := o.VerifyIDToken(context.Background(), "apple", p.Token(t, "app.bundle", "s", nonce, nil), nonce); !errors.Is(err, ErrProviderUnavailable) {
		t.Fatalf("err = %v, want ErrProviderUnavailable while provider is down", err)
	}
	p.Broken.Store(false)
	if _, err := o.VerifyIDToken(context.Background(), "apple", p.Token(t, "app.bundle", "s", nonce, nil), nonce); err != nil {
		t.Fatalf("after recovery: %v", err)
	}
}

func TestExchangeCode(t *testing.T) {
	t.Parallel()
	p := oidctest.New(t)
	o := NewOIDC(p.Srv.Client(), p.Config(), config.Provider{}, config.Provider{})
	ctx := context.Background()
	const verifier = "pkce-verifier-0123456789-0123456789-0123456789"

	p.CodeToken.Store(p.Token(t, "web.services", "s", "", map[string]any{"id": 7}))
	id, err := o.ExchangeCode(ctx, "telegram", oidctest.GoodCode, verifier, "https://app.example/auth/callback", "")
	if err != nil {
		t.Fatalf("ExchangeCode: %v", err)
	}
	if id.Subject != "7" {
		t.Fatalf("identity = %+v", id)
	}
	if got, _ := p.LastVerifier.Load().(string); got != verifier {
		t.Fatalf("code_verifier sent = %q, want %q (PKCE)", got, verifier)
	}

	if _, err := o.ExchangeCode(ctx, "telegram", oidctest.GoodCode, verifier, "https://evil.example/cb", ""); !errors.Is(err, ErrRedirectNotAllowed) {
		t.Fatalf("foreign redirect: err = %v, want ErrRedirectNotAllowed", err)
	}
	if _, err := o.ExchangeCode(ctx, "telegram", "bad-code", verifier, "https://app.example/auth/callback", ""); !errors.Is(err, ErrInvalidIDToken) {
		t.Fatalf("bad code: err = %v, want ErrInvalidIDToken", err)
	}
	p.CodeToken.Store("")
	if _, err := o.ExchangeCode(ctx, "telegram", oidctest.GoodCode, verifier, "https://app.example/auth/callback", ""); !errors.Is(err, ErrInvalidIDToken) {
		t.Fatalf("no id_token: err = %v, want ErrInvalidIDToken", err)
	}
	p.CodeToken.Store(p.Token(t, "web.services", "s", "n-1", map[string]any{"id": 7}))
	if _, err := o.ExchangeCode(ctx, "telegram", oidctest.GoodCode, verifier, "https://app.example/auth/callback", "n-2-mismatch"); !errors.Is(err, ErrInvalidIDToken) {
		t.Fatalf("nonce mismatch: err = %v, want ErrInvalidIDToken", err)
	}
	if _, err := o.ExchangeCode(ctx, "google", oidctest.GoodCode, verifier, "https://app.example/auth/callback", ""); !errors.Is(err, ErrProviderUnavailable) {
		t.Fatalf("unconfigured: err = %v, want ErrProviderUnavailable", err)
	}
}
