package jackpot

import (
	"encoding/json"
	"log"
	"time"

	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
)

func GetPots(c *fiber.Ctx) error {
	redis := service.GetRedisConnection()

	if err := ensureSystemJackpots(c.Context(), redis, c.Get("server-id")); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to ensure system jackpots"})
	}

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

	nowMs := time.Now().UnixMilli()
	pots := make([]json.RawMessage, 0, len(values))
	for i, val := range values {
		rawStr, ok := val.(string)
		if !ok || rawStr == "" {
			continue
		}
		var j JackpotData
		if err := json.Unmarshal([]byte(rawStr), &j); err != nil {
			pots = append(pots, json.RawMessage(rawStr))
			continue
		}
		drop, err := advanceJackpotInPlace(c, redis, allKeys[i], &j, nowMs)
		if err != nil {
			log.Printf("[Jackpot] advance %s: %v", allKeys[i], err)
			pots = append(pots, json.RawMessage(rawStr))
			continue
		}
		if drop {
			continue
		}
		out, err := json.Marshal(&j)
		if err != nil {
			pots = append(pots, json.RawMessage(rawStr))
			continue
		}
		pots = append(pots, json.RawMessage(out))
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"pots":   pots,
	})
}
