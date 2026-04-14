package jackpot

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Matches shared/util/jackpot-value-cap.ts JACKPOT_INFINITY_VALUE_CAP
const jackpotInfinityValueCap int64 = 1_000_000_000_000_000

func systemJackpotRedisID(global bool, serverID string, valueCap int64) string {
	if global {
		return fmt.Sprintf("sys_global_%d", valueCap)
	}
	return fmt.Sprintf("sys_server_%s_%d", serverID, valueCap)
}

func newSystemJackpotData(id, serverID string, valueCap, valueFloor int64, maxPlayers int, nowMs, countdownEndMs int64) JackpotData {
	seedBytes := make([]byte, 32)
	if _, err := rand.Read(seedBytes); err != nil {
		seedBytes = []byte(id)
	}
	h := sha256.Sum256(seedBytes)
	serverSeed := hex.EncodeToString(h[:])

	return JackpotData{
		ID:             id,
		Creator:        PlayerInfo{ID: "0", Username: "System", DisplayName: "System"},
		ServerID:       serverID,
		ServerSeed:     serverSeed,
		ValueCap:       valueCap,
		ValueFloor:     valueFloor,
		MaxPlayers:     maxPlayers,
		Joinable:       true,
		Leaveable:      false,
		Status:         "waiting_for_start",
		Members:        []JackpotMember{},
		CountdownEndAt: countdownEndMs,
		CreatedAt:      nowMs,
		UpdatedAt:      nowMs,
		IsSystemPot:    true,
	}
}

// ensureSystemJackpots creates default server-scoped and global pots (idempotent via SET NX).
// Server-scoped templates are skipped when requestingServerID is empty (e.g. packeter bypass without server-id).
func ensureSystemJackpots(ctx context.Context, rdb *redis.Client, requestingServerID string) error {
	templates := []struct {
		global     bool
		cap, floor int64
		maxPlayers int
	}{
		{false, 50_000, 0, 32},
		{false, 250_000, 0, 32},
		{false, 1_000_000, 10_000, 32},
		{false, jackpotInfinityValueCap, 0, 32},
		{true, 500_000, 0, 64},
		{true, 2_000_000, 0, 64},
		{true, 10_000_000, 0, 64},
		{true, jackpotInfinityValueCap, 0, 64},
	}

	nowMs := time.Now().UnixMilli()
	countdownEndMs := nowMs + 999_999*1000

	for _, t := range templates {
		if !t.global && requestingServerID == "" {
			continue
		}
		serverID := "global"
		if !t.global {
			serverID = requestingServerID
		}
		id := systemJackpotRedisID(t.global, requestingServerID, t.cap)
		data := newSystemJackpotData(id, serverID, t.cap, t.floor, t.maxPlayers, nowMs, countdownEndMs)
		raw, err := json.Marshal(data)
		if err != nil {
			return err
		}
		if err := rdb.SetNX(ctx, "jackpot:"+id, raw, 0).Err(); err != nil {
			return err
		}
	}
	return nil
}
