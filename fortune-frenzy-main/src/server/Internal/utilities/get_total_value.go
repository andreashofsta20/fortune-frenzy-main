package utilities

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

func GetTotalValue(ctx context.Context, db *sql.Conn, uaids []string) (int64, error) {
	if len(uaids) == 0 {
		return 0, nil
	}

	itemIDs := make([]string, len(uaids))
	for i, uaid := range uaids {
		parts := strings.Split(uaid, ":")
		if len(parts) != 2 {
			return 0, fmt.Errorf("invalid user asset ID format: %s", uaid)
		}
		itemIDs[i] = parts[1]
	}

	query := "SELECT value FROM items WHERE id IN (?" + strings.Repeat(",?", len(itemIDs)-1) + ")"
	args := make([]any, len(itemIDs))
	for i, id := range itemIDs {
		args[i] = id
	}

	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return 0, fmt.Errorf("failed to query items: %w", err)
	}
	defer rows.Close()

	var totalValue int64
	for rows.Next() {
		var value int64
		if err := rows.Scan(&value); err != nil {
			return 0, fmt.Errorf("failed to scan value: %w", err)
		}
		totalValue += value
	}

	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("error iterating rows: %w", err)
	}

	return totalValue, nil
}