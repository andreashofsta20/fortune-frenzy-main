package misc

import (
	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
)

type MinigameStat struct {
	CurrentCCU       int   `json:"current_ccu"`
	TotalSpent       int64 `json:"total_spent"`
	TotalGamesPlayed int64 `json:"total_games_played"`
	TotalWins        int64 `json:"total_wins"`
	TotalLosses      int64 `json:"total_losses"`
}

func GetMinigameStats(c *fiber.Ctx) error {
	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	rows, err := db.QueryContext(c.Context(),
		"SELECT mode, current_ccu, total_spent, total_games_played, total_wins, total_losses FROM minigame_stats",
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to query statistics"})
	}
	defer rows.Close()

	stats := make(map[string]MinigameStat)
	for rows.Next() {
		var mode string
		var s MinigameStat
		if err := rows.Scan(&mode, &s.CurrentCCU, &s.TotalSpent, &s.TotalGamesPlayed, &s.TotalWins, &s.TotalLosses); err != nil {
			continue
		}
		stats[mode] = s
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"stats":  stats,
	})
}
