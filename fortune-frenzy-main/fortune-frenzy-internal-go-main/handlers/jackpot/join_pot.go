package jackpot

import (
	"encoding/json"
	"ffinternal-go/service"
	"ffinternal-go/utilities"
	"time"

	"github.com/gofiber/fiber/v2"
)

type JoinPotBody struct {
	UserID     interface{}    `json:"user_id"`
	Items      []string       `json:"items"`
	ItemCounts map[string]int `json:"item_counts"`
	ClientSeed string         `json:"client_seed"`
}

func JoinPot(c *fiber.Ctx) error {
	jackpotID := c.Params("jackpotId")
	if jackpotID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing jackpot ID"})
	}

	var body JoinPotBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	userIDStr := parseCreatorID(body.UserID)
	if userIDStr == "" || len(body.Items) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing required fields"})
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

	if jackpot.Status != "waiting_for_start" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Jackpot is not accepting players"})
	}

	for _, m := range jackpot.Members {
		if m.Player.ID == userIDStr {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "User already in jackpot"})
		}
	}

	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	totalValue, err := utilities.GetTotalValue(c.Context(), db, body.Items)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to calculate item values"})
	}

	userInfos, err := utilities.GetUserInfo(c.Context(), db, []string{userIDStr})
	if err != nil || len(userInfos) == 0 {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to look up user"})
	}

	playerInfo := PlayerInfo{ID: userIDStr}
	if userInfos[0].Username != nil {
		playerInfo.Username = *userInfos[0].Username
	}
	if userInfos[0].DisplayName != nil {
		playerInfo.DisplayName = *userInfos[0].DisplayName
	}

	member := JackpotMember{
		Player:     playerInfo,
		Items:      body.Items,
		ItemCounts: body.ItemCounts,
		TotalValue: totalValue,
		ClientSeed: body.ClientSeed,
	}

	jackpot.Members = append(jackpot.Members, member)
	jackpot.UpdatedAt = time.Now().UnixMilli()

	data, err := json.Marshal(jackpot)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update jackpot"})
	}

	ttl, err := redis.TTL(c.Context(), "jackpot:"+jackpotID).Result()
	if err != nil || ttl <= 0 {
		ttl = jackpotTTL
	}

	if err := redis.Set(c.Context(), "jackpot:"+jackpotID, string(data), ttl).Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save jackpot"})
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"pot":    jackpot,
	})
}
