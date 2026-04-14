package casebattles

import (
	"context"
	"encoding/json"
	"ffinternal-go/service"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
)

type JoinBattleRequest struct {
	UserID     interface{} `json:"user_id"`
	Position   int         `json:"position"`
	ClientSeed string      `json:"client_seed"`
}

func JoinBattle(c *fiber.Ctx) error {
	battleID := c.Params("battleId")
	if battleID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing battle ID"})
	}

	var body JoinBattleRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	userIDStr := parseUserID(body.UserID)
	if userIDStr == "" || userIDStr == "0" || body.Position < 1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing required fields"})
	}

	redis := service.GetRedisConnection()
	ctx := c.Context()
	redisKey := "casebattle:" + battleID
	lockKey := "casebattle_lock:" + battleID

	acquired, err := redis.SetNX(ctx, lockKey, "1", 10*time.Second).Result()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to acquire lock"})
	}
	if !acquired {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Battle is being modified"})
	}
	defer redis.Del(ctx, lockKey)

	raw, err := redis.Get(ctx, redisKey).Result()
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Battle not found"})
	}

	var battle CaseBattleData
	if err := json.Unmarshal([]byte(raw), &battle); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to parse battle"})
	}

	if battle.Status != "waiting_for_players" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Battle is not accepting players"})
	}

	totalNeeded := teamModePlayerCount(battle.TeamMode)

	for _, p := range battle.Players {
		if p.Position == body.Position {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Position is already taken"})
		}
	}

	isBot := false
	username := "Player"
	displayName := "Player"

	creatorID := ""
	if len(battle.Players) > 0 {
		creatorID = battle.Players[0].ID
	}

	if creatorID == userIDStr {
		isBot = true
		botID := fmt.Sprintf("BOT_%s_%d", battleID, body.Position)
		userIDStr = botID
		username = "Bot"
		displayName = "Bot"
	} else {
		db, err := service.GetMariaDBConnection()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "DB error"})
		}
		defer db.Close()

		origUID := parseUserID(body.UserID)
		err = db.QueryRowContext(ctx,
			"SELECT name, display_name FROM users WHERE user_id = ?", origUID,
		).Scan(&username, &displayName)
		if err != nil {
			username = "Player"
			displayName = "Player"
		}
	}

	newPlayer := BattlePlayer{
		ID:          userIDStr,
		Username:    username,
		DisplayName: displayName,
		Position:    body.Position,
		Bot:         isBot,
		ClientSeed:  body.ClientSeed,
	}
	if isBot {
		newPlayer.ClientSeed = fmt.Sprintf("%s_BOT_%d", battleID, body.Position)
	}

	battle.Players = append(battle.Players, newPlayer)
	battle.PlayerPulls[userIDStr] = PlayerPull{Items: []PullItem{}, TotalValue: 0}
	battle.UpdatedAt = time.Now().UnixMilli()

	shouldStartRoundProgression := false
	if len(battle.Players) >= totalNeeded {
		caseDataMap, err := fetchCaseDataMapForIDs(ctx, battle.Cases)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load case data"})
		}

		if err := PrepareStartedCaseBattle(&battle, caseDataMap); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start battle: " + err.Error()})
		}

		shouldStartRoundProgression = battle.Status == "in_progress"
	}

	data, err := json.Marshal(battle)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to serialize battle"})
	}

	if err := redis.Set(ctx, redisKey, string(data), 2*time.Hour).Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save battle"})
	}

	if battle.Status == "completed" {
		w := append([]WinnerInfo(nil), battle.WinnersInfo...)
		go settleCaseBattleWinners(context.Background(), battleID, w)
	}

	// Progression must read the same in-progress snapshot we just persisted (avoids racing stale Redis).
	if shouldStartRoundProgression {
		go StartRoundProgression(battleID)
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"data":   redactCaseBattleForClient(battle),
	})
}
