package casebattles

import (
	"context"
	"encoding/json"
	"ffinternal-go/service"
	"log"
	"strconv"
	"time"
)

const (
	normalStepDurationMs = 3800
	fastStepDurationMs   = 2200
	lockTTL              = 10 * time.Second
)

func getStepDuration(fastMode bool) int64 {
	if fastMode {
		return fastStepDurationMs
	}
	return normalStepDurationMs
}

func StartRoundProgression(battleID string) {
	redis := service.GetRedisConnection()
	ctx := context.Background()
	redisKey := "casebattle:" + battleID

	for {
		raw, err := redis.Get(ctx, redisKey).Result()
		if err != nil {
			log.Printf("[CaseBattle] Battle %s not found, stopping", battleID)
			return
		}

		var battle CaseBattleData
		if err := json.Unmarshal([]byte(raw), &battle); err != nil {
			log.Printf("[CaseBattle] Failed to parse battle %s", battleID)
			return
		}

		if battle.Status == "completed" {
			return
		}
		if battle.Status == "waiting_for_players" {
			time.Sleep(1 * time.Second)
			continue
		}
		if battle.Status != "in_progress" {
			time.Sleep(1 * time.Second)
			continue
		}

		now := time.Now().UnixMilli()
		if battle.NextStepAt != nil && *battle.NextStepAt > now {
			sleepMs := *battle.NextStepAt - now
			time.Sleep(time.Duration(sleepMs) * time.Millisecond)
		}

		lockKey := "casebattle_prog_lock:" + battleID
		acquired, err := redis.SetNX(ctx, lockKey, "1", lockTTL).Result()
		if err != nil || !acquired {
			time.Sleep(500 * time.Millisecond)
			continue
		}

		shouldStop := false
		func() {
			defer func() { _ = redis.Del(ctx, lockKey) }()

			raw, err := redis.Get(ctx, redisKey).Result()
			if err != nil {
				return
			}
			if err := json.Unmarshal([]byte(raw), &battle); err != nil {
				return
			}
			if battle.Status != "in_progress" {
				if battle.Status == "completed" {
					shouldStop = true
				}
				return
			}

			if battle.ResolvedPulls == nil || len(battle.ResolvedPulls) == 0 {
				log.Printf("[CaseBattle] Battle %s missing resolved_pulls; stopping progression", battleID)
				shouldStop = true
				return
			}

			n := len(battle.Cases)
			cur := battle.SpinData.CurrentCaseIndex
			nextIdx := cur + 1

			if nextIdx < n {
				battle.PlayerPulls = visiblePullsFromResolved(battle.ResolvedPulls, nextIdx)
				battle.SpinData.CurrentCaseIndex = nextIdx
				battle.SpinData.CaseID = battle.Cases[nextIdx]
				battle.SpinData.Progress = strconv.Itoa(nextIdx + 1)
				step := getStepDuration(battle.FastMode)
				ns := time.Now().UnixMilli() + step
				battle.NextStepAt = &ns
				battle.UpdatedAt = time.Now().UnixMilli()
			} else {
				battle.PlayerPulls = completionPlayerPulls(battle.ResolvedPulls)
				if len(battle.ResolvedWinners) > 0 {
					battle.WinnersInfo = append([]WinnerInfo(nil), battle.ResolvedWinners...)
				} else {
					battle.WinnersInfo = []WinnerInfo{}
				}
				battle.ResolvedPulls = nil
				battle.ResolvedWinners = nil
				battle.Status = "completed"
				battle.NextStepAt = nil
				nowMs := time.Now().UnixMilli()
				battle.CompletedAt = nowMs
				battle.UpdatedAt = nowMs
				shouldStop = true
				log.Printf("[CaseBattle] Battle %s completed with winner(s): %v", battleID, winnersStr(battle.WinnersInfo))
			}

			data, err := json.Marshal(battle)
			if err != nil {
				log.Printf("[CaseBattle] Marshal battle %s for round advance: %v", battleID, err)
				return
			}
			ttl := 2 * time.Hour
			if battle.Status == "completed" {
				ttl = 3 * time.Minute
			}
			if err := redis.Set(ctx, redisKey, string(data), ttl).Err(); err != nil {
				log.Printf("[CaseBattle] Redis set battle %s round advance: %v", battleID, err)
			} else if battle.Status == "completed" {
				w := append([]WinnerInfo(nil), battle.WinnersInfo...)
				go settleCaseBattleWinners(context.Background(), battleID, w)
			}
		}()

		if shouldStop {
			return
		}
	}
}

func winnersStr(winners []WinnerInfo) string {
	ids := ""
	for i, w := range winners {
		if i > 0 {
			ids += ", "
		}
		ids += w.PlayerID
	}
	return ids
}
