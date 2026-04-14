package trading

import (
	"encoding/json"
	"ffinternal-go/service"
	"ffinternal-go/utilities"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

type tradeUserInfo struct {
	UserID      string   `json:"user_id"`
	Username    string   `json:"username"`
	DisplayName string   `json:"display_name"`
	Items       []string `json:"items"`
}

type tradeResponse struct {
	TradeID    int64         `json:"trade_id"`  // maps to DB column `id`
	Initiator  tradeUserInfo `json:"initiator"`
	Receiver   tradeUserInfo `json:"receiver"`
	Status     string        `json:"status"`
	CreatedAt  time.Time     `json:"created_at"`
	UpdatedAt  time.Time     `json:"updated_at"`
	TransferID *string       `json:"transfer_id"`
}

func GetTrades(c *fiber.Ctx) error {
	userIdsParam := c.Params("userIds")
	if userIdsParam == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user IDs"})
	}

	userIDs := strings.Split(userIdsParam, ",")
	if len(userIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user IDs"})
	}

	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	placeholders := "?" + strings.Repeat(",?", len(userIDs)-1)
	query := "SELECT id, initiator_id, receiver_id, initiator_items, receiver_items, status, created_at, updated_at, transfer_id " +
		"FROM trades WHERE (initiator_id IN (" + placeholders + ") OR receiver_id IN (" + placeholders + ")) " +
		"AND status IN ('pending','accepted','declined','cancelled','failed')"

	args := make([]any, 0, len(userIDs)*2)
	iface := utilities.ToInterfaceSlice(userIDs)
	args = append(args, iface...)
	args = append(args, iface...)

	rows, err := db.QueryContext(c.Context(), query, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to query trades"})
	}
	defer rows.Close()

	type rawTrade struct {
		TradeID        int64
		InitiatorID    string
		ReceiverID     string
		InitiatorItems string
		ReceiverItems  string
		Status         string
		CreatedAt      time.Time
		UpdatedAt      time.Time
		TransferID     *string
	}

	var rawTrades []rawTrade
	allUserIDs := make(map[string]bool)

	for rows.Next() {
		var t rawTrade
		if err := rows.Scan(&t.TradeID, &t.InitiatorID, &t.ReceiverID, &t.InitiatorItems, &t.ReceiverItems, &t.Status, &t.CreatedAt, &t.UpdatedAt, &t.TransferID); err != nil {
			continue
		}
		rawTrades = append(rawTrades, t)
		allUserIDs[t.InitiatorID] = true
		allUserIDs[t.ReceiverID] = true
	}

	if len(rawTrades) == 0 {
		return c.JSON(fiber.Map{
			"status": "OK",
			"trades": []any{},
		})
	}

	uniqueIDs := make([]string, 0, len(allUserIDs))
	for id := range allUserIDs {
		uniqueIDs = append(uniqueIDs, id)
	}

	userInfos, err := utilities.GetUserInfo(c.Context(), db, uniqueIDs)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to look up users"})
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

	trades := make([]tradeResponse, 0, len(rawTrades))
	for _, t := range rawTrades {
		initiator := userMap[t.InitiatorID]
		var initItems []string
		_ = json.Unmarshal([]byte(t.InitiatorItems), &initItems)
		if enriched, err := utilities.EnrichStakeTokensToDisplay(c.Context(), db, initItems); err == nil {
			initiator.Items = enriched
		} else {
			initiator.Items = initItems
		}

		receiver := userMap[t.ReceiverID]
		var recvItems []string
		_ = json.Unmarshal([]byte(t.ReceiverItems), &recvItems)
		if enriched, err := utilities.EnrichStakeTokensToDisplay(c.Context(), db, recvItems); err == nil {
			receiver.Items = enriched
		} else {
			receiver.Items = recvItems
		}

		trades = append(trades, tradeResponse{
			TradeID:    t.TradeID,
			Initiator:  initiator,
			Receiver:   receiver,
			Status:     t.Status,
			CreatedAt:  t.CreatedAt,
			UpdatedAt:  t.UpdatedAt,
			TransferID: t.TransferID,
		})
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"trades": trades,
	})
}
