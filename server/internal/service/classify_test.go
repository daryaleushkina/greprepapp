package service

import (
	"errors"
	"net/http"
	"testing"

	"github.com/ogen-go/ogen/ogenerrors"

	"github.com/daryaleushkina/greprepapp/server/internal/apperr"
)

func TestClassify(t *testing.T) {
	t.Parallel()
	secret := errors.New("pq: password authentication failed for user greprep")
	cases := []struct {
		name   string
		err    error
		status int
		code   apperr.Code
	}{
		{"app error", apperr.Denied("admin only"), http.StatusForbidden, apperr.Forbidden},
		{"wrapped app error", errors.Join(errors.New("ctx"), apperr.Invalid("x", nil)), http.StatusBadRequest, apperr.BadRequest},
		{"decode error", &ogenerrors.DecodeRequestError{Err: errors.New(`unexpected field "x"`)}, http.StatusBadRequest, apperr.BadRequest},
		{"security error", &ogenerrors.SecurityError{Err: errors.New("no")}, http.StatusUnauthorized, apperr.Unauthorized},
		{"security wrapping app error", &ogenerrors.SecurityError{Err: apperr.Unauthenticated(nil)}, http.StatusUnauthorized, apperr.Unauthorized},
		{"internal", secret, http.StatusInternalServerError, apperr.Internal},
	}
	for _, c := range cases {
		status, code, msg := classify(c.err)
		if status != c.status || code != c.code {
			t.Errorf("%s: classify = %d %s, want %d %s", c.name, status, code, c.status, c.code)
		}
		if c.code == apperr.Internal && msg != "internal error" {
			t.Errorf("internal error leaked: %q", msg)
		}
	}
}

func TestProviderTitle(t *testing.T) {
	t.Parallel()
	for p, want := range map[string]string{"apple": "Apple", "google": "Google", "telegram": "Telegram", "dev": "Telegram"} {
		if got := providerTitle(p); got != want {
			t.Errorf("providerTitle(%q) = %q, want %q", p, got, want)
		}
	}
}
