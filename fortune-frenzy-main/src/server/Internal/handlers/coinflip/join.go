package coinflip

import (
	"encoding/json"
	"ffinternal-go/models"
	"ffinternal-go/service"
	"ffinternal-go/utilities"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

type JoinRequestBody struct {
	UserID int64    `json:"user_id" validate:"required"`
	Items  []string `json:"items" validate:"required,dive,required"`
}

func JoinCoinflip(c *fiber.Ctx) error {
	coinflipID := c.Params("coinflip_id")
	if coinflipID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	var body JoinRequestBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	if body.UserID == 0 || len(body.Items) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	for _, item := range body.Items {
		if !strings.HasPrefix(item, "FF") {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
		}
	}

	redis := service.GetRedisConnection()
	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to the database"})
	}
	defer db.Close()

	userIDStr := strconv.FormatInt(body.UserID, 10)
	
	_, err = redis.SetNX(c.Context(), "coinflip:"+coinflipID+":user:"+userIDStr, "active", 5*time.Second).Result()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to join coinflip"})
	}
	
	keys, err := redis.Keys(c.Context(), "coinflip:*:user:"+userIDStr).Result()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to check active coinflips"})
	}
	if len(keys) > 1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Active coinflip already exists"})
	}

	coinflipRaw, err := redis.Get(c.Context(), "coinflip:"+coinflipID).Result()
	if err != nil || coinflipRaw == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid or unavailable coinflip"})
	}

	var coinflip models.CoinflipData
	if err := json.Unmarshal([]byte(coinflipRaw), &coinflip); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to join coinflip"})
	}

	if coinflip.Status != "waiting_for_player" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Coinflip cannot be joined"})
	}

	if coinflip.Player1.ID == &userIDStr {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cannot join your own coinflip"})
	}

	rows, err := db.QueryContext(c.Context(),
		"SELECT user_asset_id FROM item_copies WHERE user_asset_id IN (?"+
			strings.Repeat(",?", len(body.Items)-1)+") AND owner_id = ?",
		append(utilities.ToInterfaceSlice(body.Items), body.UserID)...,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to verify items"})
	}
	defer rows.Close()

	confirmedItems := make(map[string]bool)
	for rows.Next() {
		var item string
		if err := rows.Scan(&item); err != nil {
			continue
		}
		confirmedItems[item] = true
	}
	if len(confirmedItems) != len(body.Items) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid items"})
	}

	player2Info, err := utilities.GetUserInfo(c.Context(), db, []string{userIDStr})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to get user info"})
	}
	player2Items, err := utilities.GetItemString(c.Context(), db, body.Items)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to get item string"})
	}

	coinflip.Player2 = &player2Info[0]
	coinflip.Player2Items = player2Items
	coinflip.Status = "awaiting_confirmation"

	data, err := json.Marshal(coinflip)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to join coinflip"})
	}

	pipe := redis.TxPipeline()
	pipe.Set(c.Context(), "coinflip:"+coinflipID, string(data), coinflipTTL)
	pipe.Set(c.Context(), "coinflip:"+coinflipID+":user:"+userIDStr, "active", coinflipTTL)
	if _, err = pipe.Exec(c.Context()); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to join coinflip"})
	}

	go func() {
		time.Sleep(1500 * time.Millisecond)
		
		resp, err := utilities.InternalRequest(c, "POST", "/coinflip/start/"+coinflipID, fiber.Map{
			"coinflip_id": coinflipID,
		})
		
		if err != nil || resp.StatusCode() != fiber.StatusOK {
			coinflip.Status = "failed"
			data, _ := json.Marshal(coinflip)
			redis.Set(c.Context(), "coinflip:"+coinflipID, string(data), 10*time.Second)
		}
	}()

	return c.JSON(fiber.Map{
		"status": "OK",
		"data":   coinflip,
	})
}