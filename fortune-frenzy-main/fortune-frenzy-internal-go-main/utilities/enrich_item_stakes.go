package utilities

import (
	"context"
	"database/sql"
	"strings"
)

// EnrichStakeTokensToDisplay normalizes trade/coinflip stake tokens to "user_asset_id:item_id"
// so clients can resolve catalog metadata without scanning local inventory.
func EnrichStakeTokensToDisplay(ctx context.Context, db *sql.Conn, tokens []string) ([]string, error) {
	if len(tokens) == 0 {
		return nil, nil
	}
	var needLookup []string
	out := make([]string, len(tokens))
	for i, t := range tokens {
		t = strings.TrimSpace(t)
		if t == "" {
			out[i] = t
			continue
		}
		parts := strings.SplitN(t, ":", 2)
		if len(parts) == 2 && parts[0] != "" && parts[1] != "" {
			out[i] = t
			continue
		}
		needLookup = append(needLookup, t)
		out[i] = t
	}
	if len(needLookup) == 0 {
		return out, nil
	}
	ph := "?" + strings.Repeat(",?", len(needLookup)-1)
	q := "SELECT user_asset_id, item_id FROM item_copies WHERE user_asset_id IN (" + ph + ")"
	args := make([]interface{}, len(needLookup))
	for j, u := range needLookup {
		args[j] = u
	}
	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	idByUA := make(map[string]string)
	for rows.Next() {
		var uaid, itemID string
		if err := rows.Scan(&uaid, &itemID); err != nil {
			continue
		}
		idByUA[uaid] = itemID
	}
	if err := rows.Err(); err != nil {
		return out, err
	}
	for i, t := range tokens {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		parts := strings.SplitN(t, ":", 2)
		if len(parts) == 2 && parts[0] != "" && parts[1] != "" {
			continue
		}
		if itemID, ok := idByUA[t]; ok && itemID != "" {
			out[i] = t + ":" + itemID
		}
	}
	return out, nil
}
