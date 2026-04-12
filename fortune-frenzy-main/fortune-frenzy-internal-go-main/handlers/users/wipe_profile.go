package users

import (
	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
)

func WipeProfile(c *fiber.Ctx) error {
	userID := c.Params("userId")
	if userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user ID"})
	}

	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to the database"})
	}
	defer conn.Close()

	tx, err := conn.BeginTx(c.Context(), nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to begin transaction"})
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(c.Context(), "DELETE FROM item_copies WHERE owner_id = ?", userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete user items"})
	}

	_, err = tx.ExecContext(c.Context(),
		`UPDATE users SET
			current_cash = '0', current_value = 0,
			total_cash_earned = 0, total_cash_spent = 0,
			win_rate = 0, biggest_win = 0,
			total_plays = 0, favourite_mode = '',
			time_played = 0, xp = 0,
			recent_activity = '[]',
			updated_at = NOW()
		 WHERE user_id = ?`, userID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to reset user profile"})
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit transaction"})
	}

	return c.JSON(fiber.Map{"status": "OK"})
}
