package misc

import (
	"context"
	"encoding/json"
	"ffinternal-go/service"
	"ffinternal-go/utilities"
	"fmt"
	"log"
	"strconv"

	"github.com/gofiber/fiber/v2"
)

func GetLeaderboard(c *fiber.Ctx) error {
	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	var cashJSON, valueJSON string
	err = db.QueryRowContext(c.Context(),
		"SELECT cash_leaderboard, value_leaderboard FROM leaderboard_cache WHERE id = 1",
	).Scan(&cashJSON, &valueJSON)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load leaderboard"})
	}

	var cashBoard [][]interface{}
	var valueBoard [][]interface{}

	if err := json.Unmarshal([]byte(cashJSON), &cashBoard); err != nil {
		cashBoard = [][]interface{}{}
	}
	if err := json.Unmarshal([]byte(valueJSON), &valueBoard); err != nil {
		valueBoard = [][]interface{}{}
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"leaderboards": fiber.Map{
			"cash":  cashBoard,
			"value": valueBoard,
		},
	})
}

func RefreshLeaderboard() {
	db, err := service.GetMariaDBConnection()
	if err != nil {
		log.Printf("RefreshLeaderboard: failed to connect to database: %v", err)
		return
	}
	defer db.Close()

	ctx := context.Background()

	excludeHouseID, _ := strconv.ParseInt(utilities.CoinflipHouseUserID(), 10, 64)

	cashRows, err := db.QueryContext(ctx,
		"SELECT user_id, name, display_name, current_cash, country FROM users WHERE user_id != ? ORDER BY current_cash DESC LIMIT 100",
		excludeHouseID,
	)
	if err != nil {
		log.Printf("RefreshLeaderboard: failed to query cash leaderboard: %v", err)
		return
	}
	defer cashRows.Close()

	cashBoard := make([][]interface{}, 0)
	for cashRows.Next() {
		var userID int64
		var name, displayName, country string
		var amount int64
		if err := cashRows.Scan(&userID, &name, &displayName, &amount, &country); err != nil {
			continue
		}
		cashBoard = append(cashBoard, []interface{}{fmt.Sprintf("%d", userID), name, displayName, fmt.Sprintf("%d", amount), country})
	}

	valueRows, err := db.QueryContext(ctx,
		"SELECT user_id, name, display_name, current_value, country FROM users WHERE user_id != ? ORDER BY current_value DESC LIMIT 100",
		excludeHouseID,
	)
	if err != nil {
		log.Printf("RefreshLeaderboard: failed to query value leaderboard: %v", err)
		return
	}
	defer valueRows.Close()

	valueBoard := make([][]interface{}, 0)
	for valueRows.Next() {
		var userID int64
		var name, displayName, country string
		var amount int64
		if err := valueRows.Scan(&userID, &name, &displayName, &amount, &country); err != nil {
			continue
		}
		valueBoard = append(valueBoard, []interface{}{fmt.Sprintf("%d", userID), name, displayName, fmt.Sprintf("%d", amount), country})
	}

	cashJSON, err := json.Marshal(cashBoard)
	if err != nil {
		log.Printf("RefreshLeaderboard: failed to marshal cash board: %v", err)
		return
	}
	valueJSON, err := json.Marshal(valueBoard)
	if err != nil {
		log.Printf("RefreshLeaderboard: failed to marshal value board: %v", err)
		return
	}

	_, err = db.ExecContext(ctx,
		"UPDATE leaderboard_cache SET cash_leaderboard = ?, value_leaderboard = ? WHERE id = 1",
		string(cashJSON), string(valueJSON),
	)
	if err != nil {
		log.Printf("RefreshLeaderboard: failed to update leaderboard cache: %v", err)
	}
}
