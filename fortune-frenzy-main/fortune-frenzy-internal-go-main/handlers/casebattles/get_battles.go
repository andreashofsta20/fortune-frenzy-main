package casebattles

import (
	"encoding/json"
	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
)

func GetBattles(c *fiber.Ctx) error {
	redis := service.GetRedisConnection()
	ctx := c.Context()

	var cursor uint64
	var allKeys []string
	for {
		keys, nextCursor, err := redis.Scan(ctx, cursor, "casebattle:*", 100).Result()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to scan case battles"})
		}
		allKeys = append(allKeys, keys...)
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	if len(allKeys) == 0 {
		return c.JSON(fiber.Map{
			"status":      "OK",
			"casebattles": []any{},
		})
	}

	values, err := redis.MGet(ctx, allKeys...).Result()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to get case battles"})
	}

	battles := make([]json.RawMessage, 0, len(values))
	for _, val := range values {
		if rawStr, ok := val.(string); ok && rawStr != "" {
			battles = append(battles, json.RawMessage(rawStr))
		}
	}

	return c.JSON(fiber.Map{
		"status":      "OK",
		"casebattles": battles,
	})
}
