package utilities

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/redis/go-redis/v9"
)

const itemStakeKeyPrefix = "itemstake:"

// TradeStakeTTLSeconds is how long pending-trade locks live in Redis (refreshed only on trade end).
const TradeStakeTTLSeconds int64 = 604800 // 7 days

// Lua: set all keys to token with TTL if none exist; otherwise return first blocking value.
var stakeLockLua = redis.NewScript(`
local ttl = tonumber(ARGV[1])
local token = ARGV[2]
for i = 1, #KEYS do
	if redis.call('EXISTS', KEYS[i]) == 1 then
		return redis.call('GET', KEYS[i])
	end
end
for i = 1, #KEYS do
	redis.call('SET', KEYS[i], token, 'EX', ttl)
end
return ''`)

func dedupeUAIDStakes(uaids []string) []string {
	seen := make(map[string]struct{}, len(uaids))
	out := make([]string, 0, len(uaids))
	for _, u := range uaids {
		if u == "" {
			continue
		}
		if _, ok := seen[u]; ok {
			continue
		}
		seen[u] = struct{}{}
		out = append(out, u)
	}
	return out
}

func stakeRedisKeys(uaids []string) []string {
	keys := make([]string, len(uaids))
	for i, u := range uaids {
		keys[i] = itemStakeKeyPrefix + u
	}
	return keys
}

// LockItemStakes reserves UAIDs for a minigame (coinflip / jackpot). tokenTag is the Redis value (e.g. coinflip:id).
func LockItemStakes(ctx context.Context, rdb *redis.Client, uaids []string, tokenTag string, ttlSeconds int64) error {
	uaids = dedupeUAIDStakes(uaids)
	if len(uaids) == 0 {
		return nil
	}
	if ttlSeconds < 120 {
		ttlSeconds = 120
	}
	keys := stakeRedisKeys(uaids)
	v, err := stakeLockLua.Run(ctx, rdb, keys, ttlSeconds, tokenTag).Result()
	if err != nil {
		return err
	}
	if s, ok := v.(string); ok && s != "" {
		return fmt.Errorf("item already in use")
	}
	return nil
}

// UnlockItemStakes removes stake keys (safe if missing).
func UnlockItemStakes(ctx context.Context, rdb *redis.Client, uaids []string) {
	uaids = dedupeUAIDStakes(uaids)
	if len(uaids) == 0 {
		return
	}
	_ = rdb.Del(ctx, stakeRedisKeys(uaids)...).Err()
}

// CheckItemsNotStaked returns an error if any UAID has an active stake lock (e.g. before marketplace list).
func CheckItemsNotStaked(ctx context.Context, rdb *redis.Client, uaids []string) error {
	uaids = dedupeUAIDStakes(uaids)
	if len(uaids) == 0 {
		return nil
	}
	vals, err := rdb.MGet(ctx, stakeRedisKeys(uaids)...).Result()
	if err != nil {
		return err
	}
	for _, v := range vals {
		if v == nil {
			continue
		}
		if s, ok := v.(string); ok && s != "" {
			return fmt.Errorf("item already in use")
		}
	}
	return nil
}

// VerifyItemCopiesOwned checks that every UAID exists in item_copies and is owned by ownerID (string user id).
func VerifyItemCopiesOwned(ctx context.Context, db *sql.Conn, ownerID string, uaids []string) error {
	uaids = dedupeUAIDStakes(MapItemsToIDs(uaids))
	if len(uaids) == 0 {
		return nil
	}
	ph := "?" + strings.Repeat(",?", len(uaids)-1)
	q := "SELECT COUNT(*) FROM item_copies WHERE user_asset_id IN (" + ph + ") AND owner_id = ?"
	args := make([]interface{}, 0, len(uaids)+1)
	for _, u := range uaids {
		args = append(args, u)
	}
	args = append(args, ownerID)
	var n int
	if err := db.QueryRowContext(ctx, q, args...).Scan(&n); err != nil {
		return err
	}
	if n != len(uaids) {
		return fmt.Errorf("invalid items or ownership")
	}
	return nil
}

// AnyItemsListed reports whether any UAID has a marketplace listing row.
func AnyItemsListed(ctx context.Context, db *sql.Conn, uaids []string) (bool, error) {
	uaids = dedupeUAIDStakes(MapItemsToIDs(uaids))
	if len(uaids) == 0 {
		return false, nil
	}
	ph := "?" + strings.Repeat(",?", len(uaids)-1)
	q := "SELECT 1 FROM item_listings WHERE user_asset_id IN (" + ph + ") LIMIT 1"
	args := make([]interface{}, len(uaids))
	for i, u := range uaids {
		args[i] = u
	}
	var one int
	err := db.QueryRowContext(ctx, q, args...).Scan(&one)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}
