package trading

import (
	"encoding/json"
	"ffinternal-go/service"
	"ffinternal-go/utilities"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
)

type CreateTradeBody struct {
	InitiatorID    string   `json:"initiator_id"`
	ReceiverID     string   `json:"receiver_id"`
	InitiatorItems []string `json:"initiator_items"`
	ReceiverItems  []string `json:"receiver_items"`
}

func CreateTrade(c *fiber.Ctx) error {
	var body CreateTradeBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	if body.InitiatorID == "" || body.ReceiverID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user IDs"})
	}
	if body.InitiatorID == body.ReceiverID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cannot trade with yourself"})
	}

	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	initiatorIDStr := body.InitiatorID
	receiverIDStr := body.ReceiverID

	userInfos, err := utilities.GetUserInfo(c.Context(), db, []string{initiatorIDStr, receiverIDStr})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to verify users"})
	}

	foundUsers := make(map[string]bool)
	for _, u := range userInfos {
		if u.ID != nil && u.Username != nil && *u.Username != "Unknown Username" {
			foundUsers[*u.ID] = true
		}
	}
	if !foundUsers[initiatorIDStr] || !foundUsers[receiverIDStr] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "One or both users not found"})
	}

	if err := utilities.VerifyItemCopiesOwned(c.Context(), db, initiatorIDStr, body.InitiatorItems); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid initiator items"})
	}
	if err := utilities.VerifyItemCopiesOwned(c.Context(), db, receiverIDStr, body.ReceiverItems); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid receiver items"})
	}

	initUA := utilities.MapItemsToIDs(body.InitiatorItems)
	recvUA := utilities.MapItemsToIDs(body.ReceiverItems)
	allStakeUA := append(append([]string{}, initUA...), recvUA...)
	if len(allStakeUA) > 0 {
		listed, lerr := utilities.AnyItemsListed(c.Context(), db, allStakeUA)
		if lerr != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": lerr.Error()})
		}
		if listed {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "An item is listed on the marketplace"})
		}
	}

	initiatorItemsJSON, _ := json.Marshal(body.InitiatorItems)
	receiverItemsJSON, _ := json.Marshal(body.ReceiverItems)

	result, err := db.ExecContext(c.Context(),
		"INSERT INTO trades (initiator_id, receiver_id, initiator_items, receiver_items, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
		body.InitiatorID, body.ReceiverID, string(initiatorItemsJSON), string(receiverItemsJSON), time.Now(), time.Now(),
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create trade"})
	}

	tradeID, _ := result.LastInsertId()

	if len(allStakeUA) > 0 {
		redis := service.GetRedisConnection()
		if err := utilities.LockItemStakes(c.Context(), redis, allStakeUA, "trade:"+strconv.FormatInt(tradeID, 10), utilities.TradeStakeTTLSeconds); err != nil {
			_, _ = db.ExecContext(c.Context(), "DELETE FROM trades WHERE id = ?", tradeID)
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Item already in use"})
		}
	}

	userMap := make(map[string]tradeUserInfo)
	for _, u := range userInfos {
		if u.ID != nil {
			info := tradeUserInfo{UserID: *u.ID}
			if u.Username != nil {
				info.Username = *u.Username
			}
			if u.DisplayName != nil {
				info.DisplayName = *u.DisplayName
			}
			userMap[*u.ID] = info
		}
	}

	initiator := userMap[initiatorIDStr]
	initiator.Items = body.InitiatorItems
	if initiator.Items == nil {
		initiator.Items = []string{}
	}

	receiver := userMap[receiverIDStr]
	receiver.Items = body.ReceiverItems
	if receiver.Items == nil {
		receiver.Items = []string{}
	}

	now := time.Now()

	trade := tradeResponse{
		TradeID:   tradeID,
		Initiator: initiator,
		Receiver:  receiver,
		Status:    "pending",
		CreatedAt: now,
		UpdatedAt: now,
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"data":   trade,
	})
}
