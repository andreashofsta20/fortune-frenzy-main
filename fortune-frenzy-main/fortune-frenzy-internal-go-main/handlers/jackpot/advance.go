package jackpot

import (
	"context"
	cryptorand "crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"time"

	"ffinternal-go/utilities"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

const (
	jackpotSpinDelayMs       = 4000
	jackpotCompleteCleanupMs = 20_000
)

func jackpotMemberStakeUAIDs(members []JackpotMember) []string {
	var out []string
	for _, m := range members {
		out = append(out, utilities.MapItemsToIDs(m.Items)...)
	}
	return out
}

func resetSystemJackpotAfterFailedSpin(j *JackpotData, nowMs int64) {
	j.Members = []JackpotMember{}
	j.Status = "waiting_for_start"
	j.AutoStartAt = 0
	j.CountdownEndAt = nowMs + 999_999*1000
	j.WinningData = nil
	j.TransferID = ""
	j.CompletedAt = 0
}

func pickJackpotWinner(members []JackpotMember) (PlayerInfo, error) {
	if len(members) == 0 {
		return PlayerInfo{}, fmt.Errorf("no members")
	}
	var total int64
	for _, m := range members {
		total += m.TotalValue
	}
	if total <= 0 {
		n, err := cryptorand.Int(cryptorand.Reader, big.NewInt(int64(len(members))))
		if err != nil {
			return PlayerInfo{}, err
		}
		return members[n.Int64()].Player, nil
	}
	rb, err := cryptorand.Int(cryptorand.Reader, big.NewInt(int64(total)))
	if err != nil {
		return PlayerInfo{}, err
	}
	roll := rb.Int64()
	var acc int64
	for _, m := range members {
		acc += m.TotalValue
		if roll < acc {
			return m.Player, nil
		}
	}
	return members[len(members)-1].Player, nil
}

func executeJackpotTransfer(c *fiber.Ctx, members []JackpotMember, winnerID string) (string, error) {
	entries := make([]map[string]interface{}, 0, len(members))
	for _, m := range members {
		entries = append(entries, map[string]interface{}{
			"user_id": m.Player.ID,
			"items":   utilities.MapItemsToIDs(m.Items),
		})
	}
	resp, err := utilities.InternalRequest(c, "POST", "/items/item-transfer", entries)
	if err != nil {
		return "", err
	}
	if resp.StatusCode() != fiber.StatusOK {
		return "", fmt.Errorf("item-transfer status %d: %s", resp.StatusCode(), string(resp.Body()))
	}
	var body struct {
		TransferID string `json:"transfer_id"`
	}
	if err := json.Unmarshal(resp.Body(), &body); err != nil || body.TransferID == "" {
		return "", fmt.Errorf("parse transfer_id: %w", err)
	}
	confirmResp, err := utilities.InternalRequest(c, "POST",
		"/items/item-transfer/"+body.TransferID+"/confirm",
		map[string]interface{}{"user_id": winnerID},
	)
	if err != nil {
		return "", err
	}
	if confirmResp.StatusCode() != fiber.StatusOK {
		return "", fmt.Errorf("confirm transfer status %d: %s", confirmResp.StatusCode(), string(confirmResp.Body()))
	}
	return body.TransferID, nil
}

func refreshJackpotJoinFlags(j *JackpotData, nowMs int64) {
	j.Joinable = j.Status == "waiting_for_start"
	if j.IsSystemPot {
		j.Leaveable = false
		return
	}
	j.Leaveable = j.Status == "waiting_for_start" && len(j.Members) > 0 &&
		(j.AutoStartAt == 0 || j.AutoStartAt-nowMs > 5000)
}

// advanceJackpotInPlace applies timer-based state transitions and persists to Redis when needed.
// Returns dropFromList=true if the key was deleted (finished player pot TTL cleanup).
func advanceJackpotInPlace(c *fiber.Ctx, rdb *redis.Client, redisKey string, j *JackpotData, nowMs int64) (dropFromList bool, err error) {
	ensureJackpotMembers(j)
	origJoin, origLeave := j.Joinable, j.Leaveable
	changed := false

	if !j.IsSystemPot && j.Status == "complete" && j.CompletedAt > 0 && nowMs >= j.CompletedAt+jackpotCompleteCleanupMs {
		if err := rdb.Del(c.Context(), redisKey).Err(); err != nil {
			return false, err
		}
		return true, nil
	}

	if j.IsSystemPot && j.Status == "complete" && j.CompletedAt > 0 && nowMs >= j.CompletedAt+jackpotCompleteCleanupMs {
		j.Members = []JackpotMember{}
		j.Status = "waiting_for_start"
		j.AutoStartAt = 0
		j.CountdownEndAt = nowMs + 999_999*1000
		j.WinningData = nil
		j.TransferID = ""
		j.CompletedAt = 0
		j.UpdatedAt = nowMs
		changed = true
	}

	// Custom pot with a scheduled start but nobody ever joined — cannot enter countdown (needs >=1 member).
	// Delete so clients don't sit on a timer that never resolves to spin/complete.
	if !j.IsSystemPot && j.Status == "waiting_for_start" && len(j.Members) == 0 && j.AutoStartAt > 0 && nowMs >= j.AutoStartAt {
		if err := rdb.Del(c.Context(), redisKey).Err(); err != nil {
			return false, err
		}
		log.Printf("[Jackpot] Removed empty custom pot %s after auto_start with no joins", j.ID)
		return true, nil
	}

	if j.Status == "waiting_for_start" && len(j.Members) >= 1 && j.AutoStartAt > 0 && nowMs >= j.AutoStartAt {
		j.Status = "countdown"
		j.CountdownEndAt = nowMs + jackpotSpinDelayMs
		j.UpdatedAt = nowMs
		changed = true
	}

	if j.Status == "countdown" && len(j.Members) >= 1 && nowMs >= j.CountdownEndAt {
		lockKey := "jackpot:finish-lock:" + j.ID
		locked, lerr := rdb.SetNX(c.Context(), lockKey, "1", 20*time.Second).Result()
		if lerr != nil {
			return false, lerr
		}
		if !locked {
			// Another request is finishing this pot; use latest Redis JSON for the response.
			if fresh, gerr := rdb.Get(c.Context(), redisKey).Result(); gerr == nil && fresh != "" {
				_ = json.Unmarshal([]byte(fresh), j)
				ensureJackpotMembers(j)
			}
			return false, nil
		}
		defer func() { _ = rdb.Del(c.Context(), lockKey) }()

		winner, werr := pickJackpotWinner(j.Members)
		if werr != nil {
			log.Printf("[Jackpot] pick winner failed pot=%s: %v", j.ID, werr)
			utilities.UnlockItemStakes(c.Context(), rdb, jackpotMemberStakeUAIDs(j.Members))
			if !j.IsSystemPot {
				if err := rdb.Del(c.Context(), redisKey).Err(); err != nil {
					return false, err
				}
				return true, nil
			}
			resetSystemJackpotAfterFailedSpin(j, nowMs)
			j.UpdatedAt = nowMs
			changed = true
		} else {
			tid, terr := executeJackpotTransfer(c, j.Members, winner.ID)
			stakeUA := jackpotMemberStakeUAIDs(j.Members)
			if terr != nil {
				log.Printf("[Jackpot] transfer failed pot=%s winner=%s: %v", j.ID, winner.ID, terr)
				utilities.UnlockItemStakes(c.Context(), rdb, stakeUA)
				if !j.IsSystemPot {
					if err := rdb.Del(c.Context(), redisKey).Err(); err != nil {
						return false, err
					}
					return true, nil
				}
				resetSystemJackpotAfterFailedSpin(j, nowMs)
			} else {
				utilities.UnlockItemStakes(c.Context(), rdb, stakeUA)
				j.Status = "complete"
				j.WinningData = &WinningData{Player: winner}
				j.TransferID = tid
				j.CompletedAt = nowMs
				j.Joinable = false
				j.Leaveable = false
			}
			j.UpdatedAt = nowMs
			changed = true
		}
	}

	refreshJackpotJoinFlags(j, nowMs)
	if j.Joinable != origJoin || j.Leaveable != origLeave {
		changed = true
		j.UpdatedAt = nowMs
	}

	if changed {
		drop, perr := persistJackpot(c.Context(), rdb, redisKey, j)
		return drop, perr
	}
	return false, nil
}

func persistJackpot(ctx context.Context, rdb *redis.Client, redisKey string, j *JackpotData) (bool, error) {
	raw, err := json.Marshal(j)
	if err != nil {
		return false, err
	}
	var ttl time.Duration
	if j.IsSystemPot {
		ttl = 0
	} else {
		ttl, _ = rdb.TTL(ctx, redisKey).Result()
		if ttl <= 0 {
			ttl = jackpotTTL
		}
	}
	if err := rdb.Set(ctx, redisKey, string(raw), ttl).Err(); err != nil {
		return false, err
	}
	return false, nil
}
