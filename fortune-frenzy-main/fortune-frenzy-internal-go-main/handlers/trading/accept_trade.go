package trading

import (
	"encoding/json"
	"ffinternal-go/service"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

func AcceptTrade(c *fiber.Ctx) error {
	tradeID := c.Params("tradeId")
	if tradeID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing trade ID"})
	}

	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	var initiatorID, receiverID int64
	var initiatorItemsJSON, receiverItemsJSON, status string
	err = db.QueryRowContext(c.Context(),
		"SELECT initiator_id, receiver_id, initiator_items, receiver_items, status FROM trades WHERE id = ?",
		tradeID,
	).Scan(&initiatorID, &receiverID, &initiatorItemsJSON, &receiverItemsJSON, &status)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Trade not found"})
	}

	if status != "pending" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Trade is not pending"})
	}

	var initiatorItems, receiverItems []string
	_ = json.Unmarshal([]byte(initiatorItemsJSON), &initiatorItems)
	_ = json.Unmarshal([]byte(receiverItemsJSON), &receiverItems)

	tx, err := db.BeginTx(c.Context(), nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start transaction"})
	}
	defer tx.Rollback()

	initiatorIDStr := strconv.FormatInt(initiatorID, 10)
	receiverIDStr := strconv.FormatInt(receiverID, 10)

	if len(initiatorItems) > 0 {
		placeholders := "?" + strings.Repeat(",?", len(initiatorItems)-1)
		args := make([]any, 0, len(initiatorItems)+1)
		args = append(args, receiverID)
		for _, item := range initiatorItems {
			args = append(args, item)
		}
		_, err = tx.ExecContext(c.Context(),
			"UPDATE item_copies SET owner_id = ? WHERE user_asset_id IN ("+placeholders+") AND owner_id = "+initiatorIDStr,
			args...,
		)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to transfer initiator items"})
		}
	}

	if len(receiverItems) > 0 {
		placeholders := "?" + strings.Repeat(",?", len(receiverItems)-1)
		args := make([]any, 0, len(receiverItems)+1)
		args = append(args, initiatorID)
		for _, item := range receiverItems {
			args = append(args, item)
		}
		_, err = tx.ExecContext(c.Context(),
			"UPDATE item_copies SET owner_id = ? WHERE user_asset_id IN ("+placeholders+") AND owner_id = "+receiverIDStr,
			args...,
		)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to transfer receiver items"})
		}
	}

	_, err = tx.ExecContext(c.Context(),
		"UPDATE trades SET status = 'accepted', updated_at = ? WHERE id = ?",
		time.Now(), tradeID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update trade status"})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit transaction"})
	}

	return c.JSON(fiber.Map{
		"status":      "OK",
		"tradeStatus": "accepted",
	})
}
