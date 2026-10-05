package auth

import (
	"bytes"
	"errors"
	"strings"
	"testing"
)

func TestSessionToken(t *testing.T) {
	t.Parallel()
	token, hash := NewSessionToken()
	if len(token) != 43 {
		t.Fatalf("token length = %d, want 43 (256 bits, base64url)", len(token))
	}
	other, _ := NewSessionToken()
	if token == other {
		t.Fatal("two tokens are equal")
	}
	parsed, err := ParseSessionToken(token)
	if err != nil {
		t.Fatalf("ParseSessionToken: %v", err)
	}
	if !bytes.Equal(parsed, hash) || len(hash) != 32 {
		t.Fatal("hash of parsed token differs from the issued one")
	}
	for _, bad := range []string{"", "short", strings.Repeat("!", 43), token + "x"} {
		if _, err := ParseSessionToken(bad); !errors.Is(err, ErrMalformedToken) {
			t.Errorf("ParseSessionToken(%q) err = %v, want ErrMalformedToken", bad, err)
		}
	}
}
