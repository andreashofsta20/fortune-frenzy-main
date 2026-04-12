package casebattles

import (
	"encoding/json"
	"ffinternal-go/service"
	"time"

	"github.com/gofiber/fiber/v2"
)

type CancelBattleRequest struct {
	UserID interface{} `json:"user_id"`
}

func CancelBattle(c *fiber.Ctx) error {
	battleID := c.Params("battleId")
	if battleID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing battle ID"})
	}

	var body CancelBattleRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if body.UserID == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user_id"})
	}

	redis := service.GetRedisConnection()
	ctx := c.Context()
	redisKey := "casebattle:" + battleID
	lockKey := "casebattle_lock:" + battleID

	acquired, err := redis.SetNX(ctx, lockKey, "1", 10*time.Second).Result()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to acquire lock"})
	}
	if !acquired {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Battle is being modified"})
	}
	defer redis.Del(ctx, lockKey)

	raw, err := redis.Get(ctx, redisKey).Result()
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Battle not found"})
	}

	var battle CaseBattleData
	if err := json.Unmarshal([]byte(raw), &battle); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to parse battle"})
	}

	if battle.Status != "waiting_for_players" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Battle cannot be cancelled"})
	}

	userIDStr := parseUserID(body.UserID)
	if len(battle.Players) == 0 || battle.Players[0].ID != userIDStr {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Only the creator can cancel the battle"})
	}

	if err := redis.Del(ctx, redisKey).Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete battle"})
	}

	return c.JSON(fiber.Map{
		"status": "OK",
	})
}
