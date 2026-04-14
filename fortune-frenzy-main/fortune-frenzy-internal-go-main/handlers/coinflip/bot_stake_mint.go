package coinflip

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"

	"ffinternal-go/utilities"
)

func randomFFUAID() (string, error) {
	b := make([]byte, 9)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "FF" + hex.EncodeToString(b), nil
}

// mintBotMirrorItemCopies creates one item_copy per player1 stake line, same item_id, owned by houseUserID.
// Player1 item strings must be "userAssetId:itemId" (same format as GetItemString).
func mintBotMirrorItemCopies(ctx context.Context, tx *sql.Tx, player1ID, houseUserID string, player1ItemStrings []string) ([]string, error) {
	if err := utilities.EnsureUserRow(ctx, tx, houseUserID, "Coinflip House"); err != nil {
		return nil, fmt.Errorf("ensure house user: %w", err)
	}
	out := make([]string, 0, len(player1ItemStrings))
	for _, itemStr := range player1ItemStrings {
		parts := strings.SplitN(itemStr, ":", 2)
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
			return nil, fmt.Errorf("invalid item format")
		}
		srcUAID, itemID := parts[0], parts[1]

		var owner int64
		err := tx.QueryRowContext(ctx,
			"SELECT owner_id FROM item_copies WHERE user_asset_id = ? FOR UPDATE",
			srcUAID,
		).Scan(&owner)
		if err != nil {
			return nil, fmt.Errorf("source item %s: %w", srcUAID, err)
		}
		if strconv.FormatInt(owner, 10) != player1ID {
			return nil, fmt.Errorf("stake item not owned by player")
		}

		if _, err = tx.ExecContext(ctx,
			"INSERT INTO item_serials (item_id, next_serial) VALUES (?, 1) ON DUPLICATE KEY UPDATE next_serial = next_serial",
			itemID,
		); err != nil {
			return nil, err
		}
		if _, err = tx.ExecContext(ctx,
			"UPDATE item_serials SET next_serial = next_serial + 1 WHERE item_id = ?",
			itemID,
		); err != nil {
			return nil, err
		}
		var serial int
		if err = tx.QueryRowContext(ctx,
			"SELECT next_serial - 1 FROM item_serials WHERE item_id = ?",
			itemID,
		).Scan(&serial); err != nil {
			return nil, err
		}

		newUAID, err := randomFFUAID()
		if err != nil {
			return nil, err
		}
		copyID, err := randomFFUAID()
		if err != nil {
			return nil, err
		}

		if _, err = tx.ExecContext(ctx,
			"INSERT INTO item_copies (user_asset_id, item_id, owner_id, serial_number, copy_id) VALUES (?, ?, ?, ?, ?)",
			newUAID, itemID, houseUserID, serial, copyID,
		); err != nil {
			return nil, fmt.Errorf("mint bot stake copy: %w", err)
		}
		out = append(out, fmt.Sprintf("%s:%s", newUAID, itemID))
	}
	return out, nil
}
