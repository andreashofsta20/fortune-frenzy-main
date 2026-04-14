package items

import (
	"encoding/json"
	"ffinternal-go/service"
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type TransferEntry struct {
	UserID interface{} `json:"user_id"`
	Items  []string    `json:"items"`
}

func parseTransferUserID(raw interface{}) string {
	switch v := raw.(type) {
	case float64:
		return fmt.Sprintf("%.0f", v)
	case string:
		if v != "" && v != "0" {
			return v
		}
	}
	return ""
}

// dedupeUAIDs preserves first-seen order. Duplicate IDs in one entry made COUNT(*) from SQL
// fall short of len(items) and incorrectly returned 400 (coinflip stacks, client retries, etc.).
func dedupeUAIDs(items []string) []string {
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, s := range items {
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}

func TransferItems(c *fiber.Ctx) error {
	var entries []TransferEntry
	if err := c.BodyParser(&entries); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if len(entries) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No transfer entries provided"})
	}

	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	for i := range entries {
		entries[i].Items = dedupeUAIDs(entries[i].Items)
	}

	for _, entry := range entries {
		userIDStr := parseTransferUserID(entry.UserID)
		if userIDStr == "" || len(entry.Items) == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Each entry must have user_id and items"})
		}

		placeholders := "?" + strings.Repeat(",?", len(entry.Items)-1)
		args := make([]interface{}, 0, len(entry.Items)+1)
		for _, item := range entry.Items {
			args = append(args, item)
		}
		args = append(args, userIDStr)

		var count int
		err := db.QueryRowContext(c.Context(),
			"SELECT COUNT(*) FROM item_copies WHERE user_asset_id IN ("+placeholders+") AND owner_id = ?",
			args...,
		).Scan(&count)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to verify items"})
		}
		if count != len(entry.Items) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Not all items belong to the specified user"})
		}
	}

	transferID := uuid.New().String()

	transferData, err := json.Marshal(entries)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to serialize transfer data"})
	}

	_, err = db.ExecContext(c.Context(),
		"INSERT INTO item_transfers (transfer_id, transfer_data, status) VALUES (?, ?, 'pending')",
		transferID, string(transferData),
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create transfer"})
	}

	return c.JSON(fiber.Map{
		"status":      "OK",
		"transfer_id": transferID,
	})
}

type ConfirmTransferBody struct {
	UserID interface{} `json:"user_id"`
}

func ConfirmTransfer(c *fiber.Ctx) error {
	transferID := c.Params("transferId")
	if transferID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Transfer ID is required"})
	}

	var body ConfirmTransferBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	winnerIDStr := parseTransferUserID(body.UserID)
	if winnerIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "user_id is required"})
	}

	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	var transferDataRaw string
	var status string
	err = db.QueryRowContext(c.Context(),
		"SELECT transfer_data, status FROM item_transfers WHERE transfer_id = ?",
		transferID,
	).Scan(&transferDataRaw, &status)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Transfer not found"})
	}

	if status != "pending" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Transfer is not pending"})
	}

	var entries []TransferEntry
	if err := json.Unmarshal([]byte(transferDataRaw), &entries); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to parse transfer data"})
	}

	tx, err := db.BeginTx(c.Context(), nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start transaction"})
	}
	defer tx.Rollback()

	for _, entry := range entries {
		for _, uaid := range entry.Items {
			_, err := tx.ExecContext(c.Context(),
				"UPDATE item_copies SET owner_id = ? WHERE user_asset_id = ?",
				winnerIDStr, uaid,
			)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to transfer items"})
			}
		}
	}

	_, err = tx.ExecContext(c.Context(),
		"UPDATE item_transfers SET status = 'confirmed', winner_id = ? WHERE transfer_id = ?",
		winnerIDStr, transferID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to confirm transfer"})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit transfer"})
	}

	return c.JSON(fiber.Map{
		"status": "OK",
	})
}
