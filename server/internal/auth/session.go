package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
)

// tokenBytes — 256 бит случайности: OWASP требует не меньше 128 и советует 160+.
const tokenBytes = 32

// tokenLen — длина токена в base64url без выравнивания.
var tokenLen = base64.RawURLEncoding.EncodedLen(tokenBytes)

// ErrMalformedToken — строка не похожа на наш токен; в базу с ней не ходим.
var ErrMalformedToken = errors.New("malformed session token")

// NewSessionToken — новый токен сессии и его хэш для базы. Сам токен уходит клиенту и больше нигде не
// хранится.
func NewSessionToken() (token string, hash []byte) {
	b := make([]byte, tokenBytes)
	// crypto/rand.Read не возвращает ошибку с Go 1.24 (при отказе источника программа падает).
	_, _ = rand.Read(b)
	token = base64.RawURLEncoding.EncodeToString(b)
	return token, HashSessionToken(token)
}

// HashSessionToken — SHA-256 токена. Быстрого хэша достаточно: у токена 256 бит случайности, перебор
// бессмыслен (RFC 6819, 5.1.4.1.3).
func HashSessionToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// ParseSessionToken проверяет вид токена перед походом в базу.
func ParseSessionToken(token string) ([]byte, error) {
	if len(token) != tokenLen {
		return nil, ErrMalformedToken
	}
	if _, err := base64.RawURLEncoding.DecodeString(token); err != nil {
		return nil, ErrMalformedToken
	}
	return HashSessionToken(token), nil
}
