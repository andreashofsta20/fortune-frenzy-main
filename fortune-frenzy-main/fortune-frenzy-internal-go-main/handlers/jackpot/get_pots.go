package jackpot

import (
	"encoding/json"
	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
)

func GetPots(c *fiber.Ctx) error {
	redis := service.GetRedisConnection()

	var cursor uint64
	var allKeys []string

	for {
		keys, nextCursor, err := redis.Scan(c.Context(), cursor, "jackpot:*", 100).Result()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to scan jackpots"})
		}
		allKeys = append(allKeys, keys...)
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	if len(allKeys) == 0 {
		return c.JSON(fiber.Map{
			"status": "OK",
			"pots":   []any{},
		})
	}

	values, err := redis.MGet(c.Context(), allKeys...).Result()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to get jackpot data"})
	}

	pots := make([]json.RawMessage, 0, len(values))
	for _, val := range values {
		if rawStr, ok := val.(string); ok && rawStr != "" {
			pots = append(pots, json.RawMessage(rawStr))
		}
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"pots":   pots,
	})
}
