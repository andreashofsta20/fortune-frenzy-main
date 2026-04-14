package coinflip

import (
	"encoding/json"
	"ffinternal-go/models"
	"ffinternal-go/service"
	"ffinternal-go/utilities"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

type JoinRequestBody struct {
	UserID interface{} `json:"user_id" validate:"required"`
	Items  []string    `json:"items" validate:"required,dive,required"`
}

func parseJoinUserID(raw interface{}) string {
	switch v := raw.(type) {
	case float64:
		return fmt.Sprintf("%.0f", v)
	case string:
		if v != "" && v != "0" {
			return v
		}
	}
	return ""
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

	userIDStr := parseJoinUserID(body.UserID)
	if userIDStr == "" || len(body.Items) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	stakeUA := utilities.MapItemsToIDs(body.Items)
	for _, u := range stakeUA {
		if !strings.HasPrefix(u, "FF") {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
		}
	}

	redis := service.GetRedisConnection()
	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to the database"})
	}
	defer db.Close()

	lockKey := "coinflip:" + coinflipID + ":user:" + userIDStr
	lockAcquired, err := redis.SetNX(c.Context(), lockKey, "active", 5*time.Second).Result()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to join coinflip"})
	}
	if !lockAcquired {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Coinflip join already in progress"})
	}
	keepUserLock := false
	defer func() {
		if !keepUserLock {
			redis.Del(c.Context(), lockKey)
		}
	}()

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

	if coinflip.Player1.ID != nil && *coinflip.Player1.ID == userIDStr {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cannot join your own coinflip"})
	}

	rows, err := db.QueryContext(c.Context(),
		"SELECT user_asset_id FROM item_copies WHERE user_asset_id IN (?"+
			strings.Repeat(",?", len(stakeUA)-1)+") AND owner_id = ?",
		append(utilities.ToInterfaceSlice(stakeUA), userIDStr)...,
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
	if len(confirmedItems) != len(stakeUA) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid items"})
	}

	listed, err := utilities.AnyItemsListed(c.Context(), db, stakeUA)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if listed {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "An item is listed on the marketplace"})
	}
	if err := utilities.LockItemStakes(c.Context(), redis, stakeUA, "coinflip:"+coinflipID, int64(coinflipTTL/time.Second)); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Item already in use"})
	}

	player2Info, err := utilities.GetUserInfo(c.Context(), db, []string{userIDStr})
	if err != nil {
		utilities.UnlockItemStakes(c.Context(), redis, stakeUA)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to get user info"})
	}
	player2Items, err := utilities.GetItemString(c.Context(), db, stakeUA)
	if err != nil {
		utilities.UnlockItemStakes(c.Context(), redis, stakeUA)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to get item string"})
	}

	coinflip.Player2 = &player2Info[0]
	coinflip.Player2Items = player2Items
	coinflip.Status = "awaiting_confirmation"

	data, err := json.Marshal(coinflip)
	if err != nil {
		utilities.UnlockItemStakes(c.Context(), redis, stakeUA)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to join coinflip"})
	}

	pipe := redis.TxPipeline()
	pipe.Set(c.Context(), "coinflip:"+coinflipID, string(data), coinflipTTL)
	pipe.Set(c.Context(), lockKey, "active", coinflipTTL)
	if _, err = pipe.Exec(c.Context()); err != nil {
		utilities.UnlockItemStakes(c.Context(), redis, stakeUA)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to join coinflip"})
	}
	keepUserLock = true

	p1StakeUA := utilities.MapItemsToIDs(coinflip.Player1Items)
	p2StakeUA := utilities.MapItemsToIDs(coinflip.Player2Items)
	forwardHeaders := utilities.CopyRequestHeaders(c)

	// Run start in this request (was async). Returning awaiting_confirmation left clients on
	// "global sync" until the next poll; if the internal HTTP start failed or lagged, the flip looked stuck forever.
	time.Sleep(100 * time.Millisecond)

	resp, startErr := utilities.InternalRequestForwarded("POST", "/coinflip/start/"+coinflipID, fiber.Map{
		"coinflip_id": coinflipID,
	}, forwardHeaders)

	if startErr != nil || resp == nil || resp.StatusCode() != fiber.StatusOK {
		statusCode := 0
		if resp != nil {
			statusCode = resp.StatusCode()
		}
		errMsg := "nil"
		if startErr != nil {
			errMsg = startErr.Error()
		}
		log.Printf("[Coinflip] Internal start request failed for %s: err=%s statusCode=%d", coinflipID, errMsg, statusCode)
		utilities.DiscordLogInternalError("CoinflipStart", coinflipID, fmt.Sprintf("Internal /coinflip/start failed: err=%s statusCode=%d", errMsg, statusCode))

		coinflip.Status = "failed"
		failData, _ := json.Marshal(coinflip)
		_ = redis.Set(c.Context(), "coinflip:"+coinflipID, string(failData), 10*time.Second).Err()
		all := append(append([]string{}, p1StakeUA...), p2StakeUA...)
		utilities.UnlockItemStakes(c.Context(), redis, all)
		_, _ = redis.Del(c.Context(), lockKey).Result()
		keepUserLock = false

		apiMsg := "Coinflip could not be finalized"
		if resp != nil && len(resp.Body()) > 0 {
			var errBody struct {
				Error string `json:"error"`
			}
			if json.Unmarshal(resp.Body(), &errBody) == nil && errBody.Error != "" {
				apiMsg = errBody.Error
			}
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": apiMsg})
	}

	var startResp struct {
		Status string              `json:"status"`
		Data   models.CoinflipData `json:"data"`
	}
	if err := json.Unmarshal(resp.Body(), &startResp); err != nil || startResp.Status != "OK" {
		log.Printf("[Coinflip] Internal start bad body for %s: err=%v", coinflipID, err)
		coinflip.Status = "failed"
		failData, _ := json.Marshal(coinflip)
		_ = redis.Set(c.Context(), "coinflip:"+coinflipID, string(failData), 10*time.Second).Err()
		all := append(append([]string{}, p1StakeUA...), p2StakeUA...)
		utilities.UnlockItemStakes(c.Context(), redis, all)
		_, _ = redis.Del(c.Context(), lockKey).Result()
		keepUserLock = false
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Coinflip could not be finalized"})
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"data":   startResp.Data,
	})
}