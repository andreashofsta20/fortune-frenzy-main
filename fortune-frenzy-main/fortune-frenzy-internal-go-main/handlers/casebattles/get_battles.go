package casebattles

import (
	"encoding/json"
	"ffinternal-go/service"
	"strings"

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

	filteredKeys := make([]string, 0, len(allKeys))
	for _, k := range allKeys {
		if !strings.HasPrefix(k, "casebattle:") {
			continue
		}
		id := strings.TrimPrefix(k, "casebattle:")
		if id == "" || strings.Contains(id, ":") {
			continue
		}
		filteredKeys = append(filteredKeys, k)
	}

	if len(filteredKeys) == 0 {
		return c.JSON(fiber.Map{
			"status":      "OK",
			"casebattles": []any{},
		})
	}

	values, err := redis.MGet(ctx, filteredKeys...).Result()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to get case battles"})
	}

	battles := make([]json.RawMessage, 0, len(values))
	for _, val := range values {
		if rawStr, ok := val.(string); ok && rawStr != "" {
			var b CaseBattleData
			if err := json.Unmarshal([]byte(rawStr), &b); err == nil {
				b = redactCaseBattleForClient(b)
				if out, err := json.Marshal(b); err == nil {
					battles = append(battles, json.RawMessage(out))
					continue
				}
			}
			battles = append(battles, json.RawMessage(rawStr))
		}
	}

	return c.JSON(fiber.Map{
		"status":      "OK",
		"casebattles": battles,
	})
}
