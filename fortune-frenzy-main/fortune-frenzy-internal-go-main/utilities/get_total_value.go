package utilities

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

const copyValueByUAID = `SELECT i.value FROM item_copies ic INNER JOIN items i ON ic.item_id = i.id WHERE ic.user_asset_id = ? LIMIT 1`

// stakeTokenValue resolves one stake line to an item value.
// - Jackpot / transfers: token is raw item_copies.user_asset_id (no colon).
// - Coinflips: utilities.GetItemString stores tokens as user_asset_id:item_id; only the
//   prefix exists in item_copies, so we look up by prefix, then fall back to items.id.
func stakeTokenValue(ctx context.Context, db *sql.Conn, token string) (int64, error) {
	if token == "" {
		return 0, fmt.Errorf("empty user_asset_id")
	}
	var v int64
	err := db.QueryRowContext(ctx, copyValueByUAID, token).Scan(&v)
	if err == nil {
		return v, nil
	}
	if err != sql.ErrNoRows {
		return 0, fmt.Errorf("lookup item copy: %w", err)
	}

	parts := strings.SplitN(token, ":", 2)
	if len(parts) != 2 {
		return 0, fmt.Errorf("unknown user_asset_id: %s", token)
	}
	prefix, itemID := parts[0], parts[1]

	err = db.QueryRowContext(ctx, copyValueByUAID, prefix).Scan(&v)
	if err == nil {
		return v, nil
	}
	if err != sql.ErrNoRows {
		return 0, fmt.Errorf("lookup item copy by prefix: %w", err)
	}

	err = db.QueryRowContext(ctx, `SELECT value FROM items WHERE id = ? LIMIT 1`, itemID).Scan(&v)
	if err == nil {
		return v, nil
	}
	if err == sql.ErrNoRows {
		return 0, fmt.Errorf("unknown user_asset_id: %s", token)
	}
	return 0, fmt.Errorf("lookup item definition: %w", err)
}

// GetTotalValue sums item values for stake tokens (raw UAIDs and/or uaid:item_id as used in coinflip Redis).
func GetTotalValue(ctx context.Context, db *sql.Conn, tokens []string) (int64, error) {
	if len(tokens) == 0 {
		return 0, nil
	}

	var total int64
	seen := make(map[string]struct{}, len(tokens))
	for _, t := range tokens {
		if _, dup := seen[t]; dup {
			return 0, fmt.Errorf("duplicate user_asset_id: %s", t)
		}
		seen[t] = struct{}{}
		v, err := stakeTokenValue(ctx, db, t)
		if err != nil {
			return 0, err
		}
		total += v
	}
	return total, nil
}
