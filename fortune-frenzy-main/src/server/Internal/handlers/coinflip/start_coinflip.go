package coinflip

import (
	"encoding/json"
	"ffinternal-go/models"
	"ffinternal-go/service"
	"ffinternal-go/utilities"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

func StartCoinflip(c *fiber.Ctx) error {
	coinflipID := c.Params("coinflip_id")
	if coinflipID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	redis := service.GetRedisConnection()
	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	coinflipRaw, err := redis.Get(c.Context(), "coinflip:"+coinflipID).Result()
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Coinflip not found"})
	}

	var coinflip models.CoinflipData
	if err := json.Unmarshal([]byte(coinflipRaw), &coinflip); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to process coinflip"})
	}

	if coinflip.Status != "awaiting_confirmation" || coinflip.Player2 == nil || coinflip.Player2Items == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Coinflip cannot be started"})
	}

	transferResp, err := utilities.InternalRequest(c, "POST", "/items/item-transfer", []map[string]interface{}{
		{
			"user_id": coinflip.Player1.ID,
			"items":   utilities.MapItemsToIDs(coinflip.Player1Items),
		},
		{
			"user_id": coinflip.Player2.ID,
			"items":   utilities.MapItemsToIDs(coinflip.Player2Items),
		},
	})
	if err != nil || transferResp.StatusCode() != fiber.StatusOK {
		coinflip.Status = "failed"
		data, _ := json.Marshal(coinflip)
		redis.Set(c.Context(), "coinflip:"+coinflipID, string(data), 5*time.Second)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Item transfer failed"})
	}

	player1Value, err := utilities.GetTotalValue(c.Context(), db, coinflip.Player1Items)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Internal Server Error"})
	}

	player2Value, err := utilities.GetTotalValue(c.Context(), db, coinflip.Player2Items)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Internal Server Error"})
	}

	winningPlayer, err := utilities.SecureFlip(
		[]string{*coinflip.Player1.ID, *coinflip.Player2.ID},
		(float64(player1Value)/float64(player1Value+player2Value))*100,
		(float64(player2Value)/float64(player1Value+player2Value))*100,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Internal Server Error"})
	}

	if winningPlayer.Result == 1 {
		val := coinflip.Player1Coin
		coinflip.WinningCoin = &val
	} else {
		if coinflip.Player1Coin == 1 {
			val := 2
			coinflip.WinningCoin = &val
		} else {
			val := 1
			coinflip.WinningCoin = &val
		}
	}

	coinflip.Status = "completed"
	var transferBody struct {
		TransferID string `json:"transfer_id"`
	}
	if err := json.Unmarshal(transferResp.Body(), &transferBody); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Internal Server Error"})
	}
	coinflip.TransferID = transferBody.TransferID

	_, err = db.ExecContext(c.Context(),
		"INSERT INTO past_coinflips (id, player1_id, player2_id, player1_items, player2_items, status, type, server_id, player1_coin, winning_coin, transfer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		coinflipID,
		coinflip.Player1.ID,
		coinflip.Player2.ID,
		strings.Join(utilities.MapItemsToIDs(coinflip.Player1Items), ","),
		strings.Join(utilities.MapItemsToIDs(coinflip.Player2Items), ","),
		coinflip.Status,
		coinflip.Type,
		coinflip.ServerID,
		coinflip.Player1Coin,
		coinflip.WinningCoin,
		coinflip.TransferID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Internal Server Error"})
	}

	var autoID int64
	err = db.QueryRowContext(c.Context(), "SELECT auto_id FROM past_coinflips WHERE id = ?", coinflipID).Scan(&autoID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Internal Server Error"})
	}
	coinflip.AutoID = autoID

	data, err := json.Marshal(coinflip)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Internal Server Error"})
	}

	pipe := redis.TxPipeline()
	pipe.Set(c.Context(), "coinflip:"+coinflipID, string(data), 5*time.Second)
	pipe.Del(c.Context(), "coinflip:"+coinflipID+":user:"+*coinflip.Player1.ID)
	pipe.Del(c.Context(), "coinflip:"+coinflipID+":user:"+*coinflip.Player2.ID)
	if _, err = pipe.Exec(c.Context()); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Internal Server Error"})
	}

	go func() {
		utilities.InternalRequest(c, "POST", "/items/item-transfer/"+coinflip.TransferID+"/confirm", map[string]interface{}{
			"user_id": func() string {
				if winningPlayer.Result == 1 {
					return *coinflip.Player1.ID
				}
				return *coinflip.Player2.ID
			}(),
		})
	}()

	return c.JSON(fiber.Map{
		"status": "OK",
		"data":   coinflip,
	})
}