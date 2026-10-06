package service

import (
	"testing"
	"time"

	"github.com/daryaleushkina/greprepapp/server/internal/db"
)

// Доступ к тренировкам — по списку ролей: роль, которой в нём нет, получает отказ, а не доступ молча.
func TestCanTrain(t *testing.T) {
	t.Parallel()
	for role, want := range map[string]bool{"user": true, "admin": true, "editor": false, "": false} {
		if got := canTrain(db.User{Role: role}); got != want {
			t.Errorf("canTrain(%q) = %v, want %v", role, got, want)
		}
	}
}

func TestClampTime(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 10, 7, 10, 0, 0, 0, time.UTC)
	now := start.Add(time.Hour)
	cases := map[time.Time]time.Time{
		start.Add(-time.Minute): start,                  // часы устройства отстают
		start.Add(time.Minute):  start.Add(time.Minute), // как есть
		now.Add(time.Hour):      now,                    // часы устройства спешат
	}
	for in, want := range cases {
		if got := clampTime(in, start, now); !got.Equal(want) {
			t.Errorf("clampTime(%v) = %v, want %v", in, got, want)
		}
	}
}
