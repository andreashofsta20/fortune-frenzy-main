package coinflip

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"ffinternal-go/models"
	"ffinternal-go/service"
	"ffinternal-go/utilities"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

const (
	coinflipTTL      = 3600 * time.Second
	coinflipIDLength = 20
)

type RequestBody struct {
	UserID int64    `json:"user_id" validate:"required"`
	Items  []string `json:"items" validate:"required,dive,required"`
	Coin   int      `json:"coin" validate:"required,oneof=1 2"`
	Type   string   `json:"type" validate:"required,oneof=server global friends"`
}

func CreateCoinflip(c *fiber.Ctx) error {
	serverID := c.Params("server_id")
	if serverID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid server ID"})
	}

	var body RequestBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	if body.UserID == 0 || len(body.Items) == 0 || (body.Coin != 1 && body.Coin != 2) ||
		(body.Type != "server" && body.Type != "global" && body.Type != "friends") {
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
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer db.Close()

	rows, err := db.QueryContext(c.Context(),
		"SELECT user_asset_id FROM item_copies WHERE user_asset_id IN (?"+
			strings.Repeat(",?", len(body.Items)-1)+") AND owner_id = ?",
		append(utilities.ToInterfaceSlice(body.Items), body.UserID)...,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
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

	userIDStr := strconv.FormatInt(body.UserID, 10)
	keys, err := redis.Keys(c.Context(), "coinflip:*:user:"+userIDStr).Result()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to check active coinflips"})
	}
	if len(keys) > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Active coinflip already exists"})
	}

	lockKey := "coinflip:lock:user:" + userIDStr
	ok, err := redis.SetNX(c.Context(), lockKey, "active", coinflipTTL).Result()
	if err != nil || !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Already creating a coinflip"})
	}
	defer redis.Del(c.Context(), lockKey)

	b := make([]byte, coinflipIDLength)
	if _, err = rand.Read(b); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate coinflip ID"})
	}
	coinflipID := strings.TrimRight(
		strings.ReplaceAll(
			strings.ReplaceAll(
				base64.StdEncoding.EncodeToString(b), "+", ""), "/", ""), "=")[:coinflipIDLength]

	userInfo, err := utilities.GetUserInfo(c.Context(), db, []string{userIDStr})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to get user info"})
	}
	itemString, err := utilities.GetItemString(c.Context(), db, body.Items)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to get item string"})
	}

	coinflipData := models.CoinflipData{
		ID:           coinflipID,
		Player1:      userInfo[0],
		Player2:      nil,
		Player1Items: itemString,
		Player2Items: nil,
		Status:       "waiting_for_player",
		Type:         body.Type,
		ServerID:     serverID,
		Player1Coin:  body.Coin,
		WinningCoin:  nil,
	}

	data, err := json.Marshal(coinflipData)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create coinflip"})
	}

	pipe := redis.TxPipeline()
	pipe.Set(c.Context(), "coinflip:"+coinflipID, string(data), coinflipTTL)
	pipe.SAdd(c.Context(), "coinflips:server:"+serverID, coinflipID)
	pipe.SAdd(c.Context(), "coinflips:global", coinflipID)
	pipe.Set(c.Context(), "coinflip:"+coinflipID+":user:"+userIDStr, "active", coinflipTTL)
	if _, err = pipe.Exec(c.Context()); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create coinflip"})
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"data":   coinflipData,
	})
}
