package jackpot

import (
	"database/sql"
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

	// Coinflip / game server send stakes as user_asset_id:item_id; DB + Redis locks use raw UAIDs only.
	stakeUAIDs := utilities.MapItemsToIDs(body.Items)

	redis := service.GetRedisConnection()

	raw, err := redis.Get(c.Context(), "jackpot:"+jackpotID).Result()
	if err != nil || raw == "" {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Jackpot not found"})
	}

	var jackpot JackpotData
	if err := json.Unmarshal([]byte(raw), &jackpot); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to parse jackpot data"})
	}
	ensureJackpotMembers(&jackpot)

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

	totalValue, err := utilities.GetTotalValue(c.Context(), db, stakeUAIDs)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to calculate item values"})
	}

	// Client jackpot UI expects stake lines as user_asset_id:item_id.
	displayItems := make([]string, len(stakeUAIDs))
	for i, uaid := range stakeUAIDs {
		var itemID string
		err := db.QueryRowContext(c.Context(),
			"SELECT item_id FROM item_copies WHERE user_asset_id = ? AND owner_id = ?",
			uaid, userIDStr,
		).Scan(&itemID)
		if err != nil {
			if err == sql.ErrNoRows {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Item not owned or not found"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to resolve stake items"})
		}
		displayItems[i] = uaid + ":" + itemID
	}

	listed, err := utilities.AnyItemsListed(c.Context(), db, stakeUAIDs)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if listed {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "An item is listed on the marketplace"})
	}
	stakeTTL := int64(jackpotTTL / time.Second)
	if jackpot.IsSystemPot {
		stakeTTL = 172800 // 48h — system pots have no Redis TTL
	}
	if err := utilities.LockItemStakes(c.Context(), redis, stakeUAIDs, "jackpot:"+jackpotID, stakeTTL); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Item already in use"})
	}

	userInfos, err := utilities.GetUserInfo(c.Context(), db, []string{userIDStr})
	if err != nil || len(userInfos) == 0 {
		utilities.UnlockItemStakes(c.Context(), redis, stakeUAIDs)
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
		Items:      displayItems,
		ItemCounts: body.ItemCounts,
		TotalValue: totalValue,
		ClientSeed: body.ClientSeed,
	}

	wasEmpty := len(jackpot.Members) == 0
	jackpot.Members = append(jackpot.Members, member)
	jackpot.UpdatedAt = time.Now().UnixMilli()

	// Client "Starting in …" uses auto_start_at (ms). Match local-backend: first join schedules start.
	if wasEmpty && jackpot.AutoStartAt == 0 {
		nowMs := time.Now().UnixMilli()
		delayMs := int64(10 * 1000)
		if jackpot.ServerID == "global" {
			delayMs = 60 * 1000
		} else if jackpot.IsSystemPot {
			delayMs = 30 * 1000
		}
		jackpot.AutoStartAt = nowMs + delayMs
		jackpot.CountdownEndAt = jackpot.AutoStartAt
	}

	data, err := json.Marshal(jackpot)
	if err != nil {
		utilities.UnlockItemStakes(c.Context(), redis, stakeUAIDs)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update jackpot"})
	}

	var ttl time.Duration
	if jackpot.IsSystemPot {
		ttl = 0
	} else {
		var ttlErr error
		ttl, ttlErr = redis.TTL(c.Context(), "jackpot:"+jackpotID).Result()
		if ttlErr != nil || ttl <= 0 {
			ttl = jackpotTTL
		}
	}

	if err := redis.Set(c.Context(), "jackpot:"+jackpotID, string(data), ttl).Err(); err != nil {
		utilities.UnlockItemStakes(c.Context(), redis, stakeUAIDs)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save jackpot"})
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"pot":    jackpot,
	})
}
