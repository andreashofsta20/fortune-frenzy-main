package workers

import (
	"context"
	"encoding/json"
	"ffinternal-go/service"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type RolimonsItem struct {
	Name  string
	RAP   int64
	Value int64
}

const (
	rolimonsURL            = "https://www.rolimons.com/itemapi/itemdetails"
	refreshInterval        = 5 * time.Minute
	rolimonsMergeBatchSize = 250
)

// rolimonsInitialDelay waits before the first merge so cold-start joins are not blocked by a long
// items-table transaction (GET /cases and marketplace catalog read the same rows).
func rolimonsInitialDelay() time.Duration {
	s := strings.TrimSpace(os.Getenv("ROLIMONS_INITIAL_DELAY_SEC"))
	if s == "" {
		return 8 * time.Second
	}
	sec, err := strconv.Atoi(s)
	if err != nil || sec < 0 {
		return 8 * time.Second
	}
	if sec > 600 {
		sec = 600
	}
	return time.Duration(sec) * time.Second
}

func StartRolimonsWorker() {
	go func() {
		d := rolimonsInitialDelay()
		if d > 0 {
			log.Printf("[Rolimons] First merge delayed by %v so API traffic can start without waiting on a large items lock", d)
			time.Sleep(d)
		}
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
	const upsertSQL = `INSERT INTO items (id, asset_id, name, value, average_price, category)
		VALUES (?, ?, ?, ?, 0, 'limited')
		ON DUPLICATE KEY UPDATE name=VALUES(name), value=VALUES(value), updated_at=NOW()`

	type mergeRow struct {
		itemID  string
		assetID string
		name    string
		value   int64
	}
	var rows []mergeRow
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
		rows = append(rows, mergeRow{
			itemID:  "limited_" + assetID,
			assetID: assetID,
			name:    name,
			value:   resolvedValue,
		})
	}

	count := 0
	for start := 0; start < len(rows); start += rolimonsMergeBatchSize {
		end := start + rolimonsMergeBatchSize
		if end > len(rows) {
			end = len(rows)
		}
		batch := rows[start:end]

		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin tx failed: %w", err)
		}
		stmt, err := tx.PrepareContext(ctx, upsertSQL)
		if err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("prepare failed: %w", err)
		}
		for _, r := range batch {
			_, err := stmt.Exec(r.itemID, r.assetID, r.name, r.value)
			if err != nil {
				log.Printf("[Rolimons] Failed to upsert %s: %v", r.assetID, err)
				continue
			}
			count++
		}
		_ = stmt.Close()
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit failed (batch %d-%d): %w", start, end, err)
		}
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
