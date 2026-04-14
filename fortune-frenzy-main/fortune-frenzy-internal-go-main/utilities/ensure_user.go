package utilities

import (
	"context"
	"database/sql"
	"strconv"
)

// EnsureUserRow inserts a minimal users row if missing (FK targets for item_copies, trades, etc.).
func EnsureUserRow(ctx context.Context, exec interface {
	ExecContext(context.Context, string, ...interface{}) (sql.Result, error)
}, userIDStr, displayName string) error {
	id, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		return err
	}
	if displayName == "" {
		displayName = "Player"
	}
	_, err = exec.ExecContext(ctx,
		`INSERT INTO users (user_id, name, display_name) VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE user_id = user_id`,
		id, displayName, displayName,
	)
	return err
}
