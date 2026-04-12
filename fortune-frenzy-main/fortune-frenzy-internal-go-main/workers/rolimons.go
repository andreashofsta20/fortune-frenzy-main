package workers

import (
	"context"
	"encoding/json"
	"ffinternal-go/service"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type RolimonsItem struct {
	Name  string
	RAP   int64
	Value int64
}

const rolimonsURL = "https://www.rolimons.com/itemapi/itemdetails"
const refreshInterval = 5 * time.Minute

func StartRolimonsWorker() {
	go func() {
		for {
			if err := fetchAndMergeRolimons(); err != nil {
				log.Printf("[Rolimons] Error: %v", err)
			}
			time.Sleep(refreshInterval)
		}
	}()
}

func fetchAndMergeRolimons() error {
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(rolimonsURL)
	if err != nil {
		return fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read body: %w", err)
	}

	var result struct {
		Success bool                `json:"success"`
		Items   map[string][]any    `json:"items"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("JSON decode failed: %w", err)
	}
	if !result.Success {
		return fmt.Errorf("Rolimons API returned success=false")
	}

	db, err := service.GetMariaDBConnection()
	if err != nil {
		return fmt.Errorf("DB connection failed: %w", err)
	}
	defer db.Close()

	ctx := context.Background()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx failed: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `INSERT INTO items (id, asset_id, name, value, average_price, category)
		VALUES (?, ?, ?, ?, ?, 'limited')
		ON DUPLICATE KEY UPDATE name=VALUES(name), value=VALUES(value), average_price=VALUES(average_price), updated_at=NOW()`)
	if err != nil {
		return fmt.Errorf("prepare failed: %w", err)
	}
	defer stmt.Close()

	count := 0
	for assetID, row := range result.Items {
		if len(row) < 4 {
			continue
		}

		name, _ := row[0].(string)
		rap := toInt64(row[2])
		value := toInt64(row[3])

		resolvedValue := value
		if resolvedValue <= 0 {
			resolvedValue = rap
		}
		if resolvedValue <= 0 {
			continue
		}

		avgPrice := rap
		if avgPrice <= 0 {
			avgPrice = value
		}

		itemID := "limited_" + assetID
		_, err := stmt.Exec(itemID, assetID, name, resolvedValue, avgPrice)
		if err != nil {
			log.Printf("[Rolimons] Failed to upsert %s: %v", assetID, err)
			continue
		}
		count++
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit failed: %w", err)
	}

	log.Printf("[Rolimons] Merged %d items into catalog", count)

	redis := service.GetRedisConnection()
	cacheData, _ := json.Marshal(result.Items)
	redis.Set(ctx, "rolimons:catalog", string(cacheData), 24*time.Hour)

	return nil
}

func toInt64(v any) int64 {
	switch val := v.(type) {
	case float64:
		return int64(val)
	case string:
		n, _ := strconv.ParseInt(strings.TrimSpace(val), 10, 64)
		return n
	default:
		return 0
	}
}
