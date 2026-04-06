package coinflip

import (
	"encoding/json"
	"ffinternal-go/models"
	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
)

func CancelCoinflip(c *fiber.Ctx) error {
	coinflipID := c.Params("coinflip_id")
	if coinflipID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	redis := service.GetRedisConnection()
	coinflipDataStr, err := redis.Get(c.Context(), "coinflip:"+coinflipID).Result()
	if err != nil || coinflipDataStr == "" {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Coinflip not found"})
	}

	var coinflipData models.CoinflipData
	if err := json.Unmarshal([]byte(coinflipDataStr), &coinflipData); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to cancel coinflip"})
	}

	if coinflipData.Status != "waiting_for_player" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Coinflip cannot be canceled"})
	}

	pipe := redis.TxPipeline()
	pipe.Del(c.Context(), "coinflip:"+coinflipID)
	pipe.Del(c.Context(), "coinflip:"+coinflipID+":user:"+*coinflipData.Player1.ID)

	if coinflipData.Player2 != nil {
		pipe.Del(c.Context(), "coinflip:"+coinflipID+":user:"+*coinflipData.Player2.ID)
	}

	pipe.SRem(c.Context(), "coinflips:server:"+coinflipData.ServerID, coinflipID)
	pipe.SRem(c.Context(), "coinflips:global", coinflipID)

	if _, err := pipe.Exec(c.Context()); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to cancel coinflip"})
	}
	return c.JSON(fiber.Map{
		"status":  "OK",
		"message": "Coinflip canceled successfully",
	})
}
