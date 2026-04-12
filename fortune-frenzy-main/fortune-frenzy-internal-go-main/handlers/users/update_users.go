package users

import (
	"encoding/json"
	"ffinternal-go/service"
	"fmt"
	"strconv"

	"github.com/gofiber/fiber/v2"
)

func UpdateUsers(c *fiber.Ctx) error {
	var updates []map[string]interface{}
	if err := c.BodyParser(&updates); err != nil {
		return c.JSON(fiber.Map{"status": "OK"})
	}

	if len(updates) == 0 {
		return c.JSON(fiber.Map{"status": "OK"})
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

	stmt, err := tx.PrepareContext(c.Context(),
		`UPDATE users SET
			name = ?, display_name = ?, current_cash = ?, current_value = ?,
			total_cash_earned = ?, total_cash_spent = ?, win_rate = ?, biggest_win = ?,
			total_plays = ?, favourite_mode = ?, time_played = ?, xp = ?,
			recent_activity = ?, updated_at = NOW()
		 WHERE user_id = ?`,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to prepare statement"})
	}
	defer stmt.Close()

	getString := func(m map[string]interface{}, key string) string {
		if v, ok := m[key]; ok {
			return fmt.Sprintf("%v", v)
		}
		return ""
	}
	getFloat := func(m map[string]interface{}, key string) float64 {
		if v, ok := m[key]; ok {
			switch n := v.(type) {
			case float64:
				return n
			case string:
				f, _ := strconv.ParseFloat(n, 64)
				return f
			}
		}
		return 0
	}

	for _, u := range updates {
		userID := getString(u, "user_id")
		if userID == "" {
			continue
		}

		activityJSON := "[]"
		if ra, ok := u["recent_activity"]; ok && ra != nil {
			if b, err := json.Marshal(ra); err == nil {
				activityJSON = string(b)
			}
		}

		_, err := stmt.ExecContext(c.Context(),
			getString(u, "name"), getString(u, "display_name"),
			getFloat(u, "current_cash"), getFloat(u, "current_value"),
			getFloat(u, "total_cash_earned"), getFloat(u, "total_cash_spent"),
			getFloat(u, "win_rate"), getFloat(u, "biggest_win"),
			getFloat(u, "total_plays"), getString(u, "favourite_mode"),
			getFloat(u, "time_played"), getFloat(u, "xp"),
			activityJSON, userID,
		)
		if err != nil {
			continue
		}
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit transaction"})
	}

	return c.JSON(fiber.Map{"status": "OK"})
}
