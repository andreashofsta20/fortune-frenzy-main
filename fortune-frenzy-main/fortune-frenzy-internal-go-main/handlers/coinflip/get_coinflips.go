package coinflip

import (
	"encoding/json"
	"ffinternal-go/models"
	"ffinternal-go/service"
	"github.com/gofiber/fiber/v2"
)

func GetCoinflips(c *fiber.Ctx) error {
	redis := service.GetRedisConnection()
	serverID := c.Query("server_id")

	var coinflipIDs []string
	var err error

	if serverID != "" {
		coinflipIDs, err = redis.SUnion(c.Context(), "coinflips:global", "coinflips:server:"+serverID).Result()
	} else {
		coinflipIDs, err = redis.SMembers(c.Context(), "coinflips:global").Result()
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to get coinflips"})
	}

	if len(coinflipIDs) == 0 {
		return c.JSON(fiber.Map{
			"status":    "OK",
			"coinflips": []any{},
		})
	}

	keys := make([]string, len(coinflipIDs))
	for i, id := range coinflipIDs {
		keys[i] = "coinflip:" + id
	}

	coinflipsRaw, err := redis.MGet(c.Context(), keys...).Result()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to get coinflips"})
	}

	coinflips := make([]models.CoinflipData, 0)
	staleCoinflipIDs := make([]string, 0)
	for index, raw := range coinflipsRaw {
		coinflipID := coinflipIDs[index]
		if rawStr, ok := raw.(string); ok && rawStr != "" {
			var cf models.CoinflipData
			if err := json.Unmarshal([]byte(rawStr), &cf); err == nil {
				// Include friends so clients can filter "Friends Only"; global tab still excludes them client-side.
				if cf.Type == "global" || cf.Type == "friends" || (cf.Type == "server" && cf.ServerID == serverID) {
					coinflips = append(coinflips, cf)
				}
			}
		} else {
			staleCoinflipIDs = append(staleCoinflipIDs, coinflipID)
		}
	}

	if len(staleCoinflipIDs) > 0 {
		pipe := redis.TxPipeline()
		for _, staleID := range staleCoinflipIDs {
			pipe.SRem(c.Context(), "coinflips:global", staleID)
			if serverID != "" {
				pipe.SRem(c.Context(), "coinflips:server:"+serverID, staleID)
			}
		}
		_, _ = pipe.Exec(c.Context())
	}

	return c.JSON(fiber.Map{
		"status":    "OK",
		"coinflips": coinflips,
	})
}
