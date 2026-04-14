package trading

import (
	"encoding/json"
	"ffinternal-go/service"
	"ffinternal-go/utilities"
	"time"

	"github.com/gofiber/fiber/v2"
)

func CancelTrade(c *fiber.Ctx) error {
	tradeID := c.Params("tradeId")
	if tradeID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing trade ID"})
	}

	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	var status, initiatorItemsJSON, receiverItemsJSON string
	err = db.QueryRowContext(c.Context(),
		"SELECT status, initiator_items, receiver_items FROM trades WHERE id = ?",
		tradeID,
	).Scan(&status, &initiatorItemsJSON, &receiverItemsJSON)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Trade not found"})
	}

	if status != "pending" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Trade is not pending"})
	}

	_, err = db.ExecContext(c.Context(),
		"UPDATE trades SET status = 'cancelled', updated_at = ? WHERE id = ?",
		time.Now(), tradeID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to cancel trade"})
	}

	var initiatorItems, receiverItems []string
	_ = json.Unmarshal([]byte(initiatorItemsJSON), &initiatorItems)
	_ = json.Unmarshal([]byte(receiverItemsJSON), &receiverItems)
	stakeUA := append(utilities.MapItemsToIDs(initiatorItems), utilities.MapItemsToIDs(receiverItems)...)
	if len(stakeUA) > 0 {
		redis := service.GetRedisConnection()
		utilities.UnlockItemStakes(c.Context(), redis, stakeUA)
	}

	return c.JSON(fiber.Map{
		"status":      "OK",
		"tradeStatus": "cancelled",
	})
}
