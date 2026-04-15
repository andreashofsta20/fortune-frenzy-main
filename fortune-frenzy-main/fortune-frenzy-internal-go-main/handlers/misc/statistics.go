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

const legacyMinigameStatsQuery = `
SELECT mode, current_ccu, total_spent, total_games_played, total_wins, total_losses FROM minigame_stats`

func GetMinigameStats(c *fiber.Ctx) error {
	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	rows, err := db.QueryContext(c.Context(), legacyMinigameStatsQuery)
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

	live := liveMinigameActivityCounts(c.Context())
	for mode, n := range live {
		if s, ok := stats[mode]; ok {
			s.CurrentCCU = n
			stats[mode] = s
		}
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"stats":  stats,
	})
}

// ReportMinigameCcu is deprecated (activity is derived from Redis game state). Kept for older game servers.
func ReportMinigameCcu(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "OK"})
}
