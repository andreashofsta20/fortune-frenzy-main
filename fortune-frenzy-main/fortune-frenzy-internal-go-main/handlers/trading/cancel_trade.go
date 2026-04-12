package trading

import (
	"ffinternal-go/service"
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

	var status string
	err = db.QueryRowContext(c.Context(),
		"SELECT status FROM trades WHERE id = ?",
		tradeID,
	).Scan(&status)
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

	return c.JSON(fiber.Map{
		"status":      "OK",
		"tradeStatus": "cancelled",
	})
}
