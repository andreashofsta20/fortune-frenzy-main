package trading

import (
	"encoding/json"
	"ffinternal-go/service"
	"ffinternal-go/utilities"
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
