package coinflip

import (
	"encoding/json"
	"ffinternal-go/models"
	"ffinternal-go/service"
	"ffinternal-go/utilities"
	"time"

	"github.com/gofiber/fiber/v2"
)

func CallBot(c *fiber.Ctx) error {
	coinflipID := c.Params("coinflip_id")
	if coinflipID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing coinflip ID"})
	}

	var body struct {
		UserID interface{} `json:"user_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	userIDStr := parseCoinflipUserID(body.UserID)
	if userIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	redis := service.GetRedisConnection()
	raw, err := redis.Get(c.Context(), "coinflip:"+coinflipID).Result()
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Coinflip not found"})
	}

	var cf models.CoinflipData
	if err := json.Unmarshal([]byte(raw), &cf); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to parse coinflip"})
	}

	if cf.Player1.ID == nil || *cf.Player1.ID != userIDStr {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Not the coinflip owner"})
	}
	if cf.Status != "waiting_for_player" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Coinflip not waiting"})
	}
	if cf.Player2 != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Already has a second player"})
	}

	botID := "BOT_" + coinflipID
	botName := "Bot"
	cf.Player2 = &models.UserInfo{
		ID:          &botID,
		Username:    &botName,
		DisplayName: &botName,
	}
	cf.Player2Items = cf.Player1Items
	cf.Status = "awaiting_confirmation"

	data, _ := json.Marshal(cf)
	if err := redis.Set(c.Context(), "coinflip:"+coinflipID, string(data), time.Hour).Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save coinflip"})
	}

	// Must not call InternalRequest from a goroutine with *fiber.Ctx — the request context is
	// invalid after this handler returns and Redis will panic on nil context.
	if _, err := utilities.InternalRequest(c, "POST", "/coinflip/start/"+coinflipID, nil); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start coinflip"})
	}

	return c.JSON(fiber.Map{"status": "OK", "data": cf})
}
