package jackpot

import (
	"context"
	"encoding/json"
	"ffinternal-go/service"
	"ffinternal-go/utilities"
	"time"

	"github.com/gofiber/fiber/v2"
)

type LeavePotBody struct {
	UserID interface{} `json:"user_id"`
}

func LeavePot(c *fiber.Ctx) error {
	jackpotID := c.Params("jackpotId")
	if jackpotID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing jackpot ID"})
	}

	var body LeavePotBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	userIDStr := parseCreatorID(body.UserID)
	if userIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user ID"})
	}

	redis := service.GetRedisConnection()

	raw, err := redis.Get(c.Context(), "jackpot:"+jackpotID).Result()
	if err != nil || raw == "" {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Jackpot not found"})
	}

	var jackpot JackpotData
	if err := json.Unmarshal([]byte(raw), &jackpot); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to parse jackpot data"})
	}
	ensureJackpotMembers(&jackpot)

	found := false
	var leavingStakeUAIDs []string
	newMembers := make([]JackpotMember, 0, len(jackpot.Members))
	for _, m := range jackpot.Members {
		if m.Player.ID == userIDStr {
			found = true
			leavingStakeUAIDs = utilities.MapItemsToIDs(m.Items)
			continue
		}
		newMembers = append(newMembers, m)
	}

	if !found {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "User not in jackpot"})
	}

	if jackpot.Status != "waiting_for_start" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cannot leave during spin"})
	}

	defer func() {
		if len(leavingStakeUAIDs) > 0 {
			utilities.UnlockItemStakes(context.Background(), redis, leavingStakeUAIDs)
		}
	}()

	if len(newMembers) == 0 {
		if jackpot.IsSystemPot {
			jackpot.Members = []JackpotMember{}
			jackpot.AutoStartAt = 0
			jackpot.CountdownEndAt = time.Now().UnixMilli() + 999_999*1000
			jackpot.UpdatedAt = time.Now().UnixMilli()
			data, err := json.Marshal(jackpot)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update jackpot"})
			}
			if err := redis.Set(c.Context(), "jackpot:"+jackpotID, string(data), 0).Err(); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save jackpot"})
			}
			return c.JSON(fiber.Map{
				"status": "OK",
				"pot":    jackpot,
			})
		}
		if err := redis.Del(c.Context(), "jackpot:"+jackpotID).Err(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete jackpot"})
		}
		return c.JSON(fiber.Map{
			"status": "OK",
			"pot":    nil,
		})
	}

	jackpot.Members = newMembers
	jackpot.UpdatedAt = time.Now().UnixMilli()

	data, err := json.Marshal(jackpot)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update jackpot"})
	}

	var ttl time.Duration
	if jackpot.IsSystemPot {
		ttl = 0
	} else {
		var ttlErr error
		ttl, ttlErr = redis.TTL(c.Context(), "jackpot:"+jackpotID).Result()
		if ttlErr != nil || ttl <= 0 {
			ttl = jackpotTTL
		}
	}

	if err := redis.Set(c.Context(), "jackpot:"+jackpotID, string(data), ttl).Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save jackpot"})
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"pot":    jackpot,
	})
}
