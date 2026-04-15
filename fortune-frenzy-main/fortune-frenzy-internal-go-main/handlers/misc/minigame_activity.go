package misc

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"ffinternal-go/models"
	"ffinternal-go/service"

	"github.com/redis/go-redis/v9"
)

const (
	redisKeyItemCasesUserLast = "stats:item_cases:user_last_open"
	itemCasesOpenWindowMs     = 60_000
)

// RecordItemCaseOpen tracks the user for “unique openers in the last minute” stats.
func RecordItemCaseOpen(ctx context.Context, userID string) {
	if userID == "" {
		return
	}
	rdb := service.GetRedisConnection()
	now := float64(time.Now().UnixMilli())
	_ = rdb.ZAdd(ctx, redisKeyItemCasesUserLast, redis.Z{Score: now, Member: userID}).Err()
	_ = rdb.Expire(ctx, redisKeyItemCasesUserLast, 24*time.Hour).Err()
}

func countActiveCoinflips(ctx context.Context, rdb *redis.Client) int {
	ids, err := rdb.SMembers(ctx, "coinflips:global").Result()
	if err != nil || len(ids) == 0 {
		return 0
	}
	keys := make([]string, len(ids))
	for i, id := range ids {
		keys[i] = "coinflip:" + id
	}
	vals, err := rdb.MGet(ctx, keys...).Result()
	if err != nil {
		return 0
	}
	n := 0
	for _, raw := range vals {
		rawStr, ok := raw.(string)
		if !ok || rawStr == "" {
			continue
		}
		var cf models.CoinflipData
		if json.Unmarshal([]byte(rawStr), &cf) != nil {
			continue
		}
		if cf.Status == "waiting_for_player" || cf.Status == "awaiting_confirmation" {
			n++
		}
	}
	return n
}

func countItemCasePlayersLast60s(ctx context.Context, rdb *redis.Client) int {
	minMs := time.Now().UnixMilli() - itemCasesOpenWindowMs
	minStr := strconv.FormatInt(minMs, 10)
	// Drop stale members so the ZSET stays bounded (one member per user_id).
	_ = rdb.ZRemRangeByScore(ctx, redisKeyItemCasesUserLast, "-inf", "("+minStr).Err()
	n, err := rdb.ZCount(ctx, redisKeyItemCasesUserLast, minStr, "+inf").Result()
	if err != nil {
		return 0
	}
	return int(n)
}

func countCaseBattlePlayersActive(ctx context.Context, rdb *redis.Client) int {
	var cursor uint64
	total := 0
	for {
		keys, next, err := rdb.Scan(ctx, cursor, "casebattle:*", 100).Result()
		if err != nil {
			return total
		}
		for _, k := range keys {
			id := strings.TrimPrefix(k, "casebattle:")
			if id == "" || strings.Contains(id, ":") {
				continue
			}
			raw, err := rdb.Get(ctx, k).Result()
			if err != nil || raw == "" {
				continue
			}
			var b struct {
				Status  string            `json:"status"`
				Players []json.RawMessage `json:"players"`
			}
			if json.Unmarshal([]byte(raw), &b) != nil {
				continue
			}
			if b.Status == "waiting_for_players" || b.Status == "in_progress" {
				total += len(b.Players)
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return total
}

func countJackpotPlayersActive(ctx context.Context, rdb *redis.Client) int {
	var cursor uint64
	total := 0
	for {
		keys, next, err := rdb.Scan(ctx, cursor, "jackpot:*", 100).Result()
		if err != nil {
			return total
		}
		for _, k := range keys {
			id := strings.TrimPrefix(k, "jackpot:")
			if id == "" || strings.Contains(id, ":") {
				continue
			}
			raw, err := rdb.Get(ctx, k).Result()
			if err != nil || raw == "" {
				continue
			}
			var j struct {
				Status  string            `json:"status"`
				Members []json.RawMessage `json:"members"`
			}
			if json.Unmarshal([]byte(raw), &j) != nil {
				continue
			}
			if j.Status == "waiting_for_start" || j.Status == "countdown" {
				total += len(j.Members)
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return total
}

func liveMinigameActivityCounts(ctx context.Context) map[string]int {
	rdb := service.GetRedisConnection()
	return map[string]int{
		"Coinflip":     countActiveCoinflips(ctx, rdb),
		"Item Cases":   countItemCasePlayersLast60s(ctx, rdb),
		"Case Battles": countCaseBattlePlayersActive(ctx, rdb),
		"Jackpot":      countJackpotPlayersActive(ctx, rdb),
	}
}
