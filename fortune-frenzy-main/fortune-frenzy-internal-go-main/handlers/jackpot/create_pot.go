package jackpot

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"ffinternal-go/service"
	"ffinternal-go/utilities"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

const (
	jackpotTTL      = 2 * time.Hour
	jackpotIDLength = 20
)

type CreatePotBody struct {
	Creator       interface{} `json:"creator"`
	ServerID      string      `json:"server_id"`
	ValueCap      int64       `json:"value_cap"`
	ValueFloor    int64       `json:"value_floor"`
	MaxPlayers    int         `json:"max_players"`
	StartingAfter int64       `json:"starting_after"`
}

type PlayerInfo struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}

type JackpotMember struct {
	Player     PlayerInfo     `json:"player"`
	TotalValue int64          `json:"total_value"`
	Items      []string       `json:"items"`
	ItemCounts map[string]int `json:"item_counts"`
	ClientSeed string         `json:"client_seed"`
}

type JackpotData struct {
	ID            string          `json:"id"`
	Creator       PlayerInfo      `json:"creator"`
	ServerID      string          `json:"server_id"`
	ServerSeed    string          `json:"server_seed"`
	ValueCap      int64           `json:"value_cap"`
	ValueFloor    int64           `json:"value_floor,omitempty"`
	MaxPlayers    int             `json:"max_players,omitempty"`
	Joinable       bool            `json:"joinable"`
	Leaveable      bool            `json:"leaveable"`
	Status         string          `json:"status"`
	Members        []JackpotMember `json:"members"`
	CountdownEndAt int64           `json:"countdown_end_at"`
	CreatedAt      int64           `json:"created_at"`
	UpdatedAt      int64           `json:"updated_at"`
	WinningData    *WinningData    `json:"winning_data,omitempty"`
	TransferID     string          `json:"transfer_id,omitempty"`
	IsSystemPot    bool            `json:"is_system_pot,omitempty"`
	AutoStartAt    int64           `json:"auto_start_at,omitempty"`
}

type WinningData struct {
	Player PlayerInfo `json:"player"`
}

func parseCreatorID(raw interface{}) string {
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

func CreatePot(c *fiber.Ctx) error {
	var body CreatePotBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	creatorIDStr := parseCreatorID(body.Creator)
	if creatorIDStr == "" || body.ServerID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing required fields"})
	}

	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()
	userInfos, err := utilities.GetUserInfo(c.Context(), db, []string{creatorIDStr})
	if err != nil || len(userInfos) == 0 {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to look up creator"})
	}

	creatorInfo := PlayerInfo{ID: creatorIDStr}
	if userInfos[0].Username != nil {
		creatorInfo.Username = *userInfos[0].Username
	}
	if userInfos[0].DisplayName != nil {
		creatorInfo.DisplayName = *userInfos[0].DisplayName
	}

	b := make([]byte, jackpotIDLength)
	if _, err = rand.Read(b); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate jackpot ID"})
	}
	jackpotID := strings.TrimRight(
		strings.ReplaceAll(
			strings.ReplaceAll(
				base64.StdEncoding.EncodeToString(b), "+", ""), "/", ""), "=")
	if len(jackpotID) > jackpotIDLength {
		jackpotID = jackpotID[:jackpotIDLength]
	}

	seedBytes := make([]byte, 32)
	if _, err = rand.Read(seedBytes); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate server seed"})
	}
	hash := sha256.Sum256(seedBytes)
	serverSeed := hex.EncodeToString(hash[:])

	now := time.Now().UnixMilli()
	autoStartAt := int64(0)
	if body.StartingAfter > 0 {
		autoStartAt = now + (body.StartingAfter * 1000)
	}
	jackpot := JackpotData{
		ID:             jackpotID,
		Creator:        creatorInfo,
		ServerID:       body.ServerID,
		ServerSeed:     serverSeed,
		ValueCap:       body.ValueCap,
		ValueFloor:     body.ValueFloor,
		MaxPlayers:     body.MaxPlayers,
		Joinable:       true,
		Leaveable:      true,
		Status:         "waiting_for_start",
		Members:        []JackpotMember{},
		CountdownEndAt: 0,
		AutoStartAt:    autoStartAt,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	data, err := json.Marshal(jackpot)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create jackpot"})
	}

	redis := service.GetRedisConnection()
	if err := redis.Set(c.Context(), "jackpot:"+jackpotID, string(data), jackpotTTL).Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to store jackpot"})
	}

	return c.JSON(fiber.Map{
		"status":     "OK",
		"jackpot_id": jackpotID,
	})
}
