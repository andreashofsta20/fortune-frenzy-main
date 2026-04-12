package users

import (
	"database/sql"
	"encoding/json"
	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
)

func GetUser(c *fiber.Ctx) error {
	userID := c.Params("userId")
	if userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user ID"})
	}

	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to the database"})
	}
	defer conn.Close()

	var (
		uid             string
		name            string
		displayName     string
		totalCashEarned float64
		totalCashSpent  float64
		winRate         float64
		biggestWin      float64
		totalPlays      int64
		favouriteMode   string
		timePlayed      float64
		xp              float64
		currentCash     string
		recentActivity  json.RawMessage
		createdAt       string
		updatedAt       string
	)

	err = conn.QueryRowContext(c.Context(),
		`SELECT user_id, name, display_name,
		        total_cash_earned, total_cash_spent, win_rate, biggest_win,
		        total_plays, favourite_mode, time_played, xp, current_cash,
		        recent_activity, created_at, updated_at
		 FROM users WHERE user_id = ?`, userID,
	).Scan(
		&uid, &name, &displayName,
		&totalCashEarned, &totalCashSpent, &winRate, &biggestWin,
		&totalPlays, &favouriteMode, &timePlayed, &xp, &currentCash,
		&recentActivity, &createdAt, &updatedAt,
	)
	if err == sql.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to get user"})
	}

	var activity []any
	if recentActivity != nil {
		_ = json.Unmarshal(recentActivity, &activity)
	}
	if activity == nil {
		activity = []any{}
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"data": fiber.Map{
			"data": fiber.Map{
				"user_id":      uid,
				"name":         name,
				"display_name": displayName,
				"statistics": fiber.Map{
					"total_cash_earned": totalCashEarned,
					"total_cash_spent":  totalCashSpent,
					"win_rate":          winRate,
					"biggest_win":       biggestWin,
					"total_plays":       totalPlays,
					"favourite_mode":    favouriteMode,
					"time_played":       timePlayed,
					"xp":               xp,
					"current_cash":      currentCash,
				},
				"created_at": createdAt,
				"updated_at": updatedAt,
			},
			"recent_activity": activity,
		},
	})
}
