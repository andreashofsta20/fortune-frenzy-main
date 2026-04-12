package casebattles

import (
	"context"
	"encoding/json"
	"ffinternal-go/service"
	"fmt"
	"log"
	"sort"
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

		raw, err = redis.Get(ctx, redisKey).Result()
		if err != nil {
			redis.Del(ctx, lockKey)
			return
		}
		if err := json.Unmarshal([]byte(raw), &battle); err != nil {
			redis.Del(ctx, lockKey)
			return
		}
		if battle.Status != "in_progress" {
			redis.Del(ctx, lockKey)
			if battle.Status == "completed" {
				return
			}
			continue
		}

		totalRounds := len(battle.Cases)
		currentIndex := battle.SpinData.CurrentCaseIndex
		nextIndex := currentIndex + 1

		if nextIndex >= totalRounds {
			finalizeBattle(ctx, battleID)
			redis.Del(ctx, lockKey)
			return
		}

		stepDuration := getStepDuration(battle.FastMode)
		nextStepAt := time.Now().UnixMilli() + stepDuration

		battle.SpinData.CurrentCaseIndex = nextIndex
		battle.SpinData.CaseID = battle.Cases[nextIndex]
		battle.SpinData.Progress = fmt.Sprintf("%d/%d", nextIndex+1, totalRounds)
		battle.NextStepAt = &nextStepAt
		battle.UpdatedAt = time.Now().UnixMilli()

		data, err := json.Marshal(battle)
		if err != nil {
			redis.Del(ctx, lockKey)
			return
		}
		redis.Set(ctx, redisKey, string(data), 2*time.Hour)
		redis.Del(ctx, lockKey)
	}
}

func finalizeBattle(ctx context.Context, battleID string) {
	redis := service.GetRedisConnection()
	redisKey := "casebattle:" + battleID

	raw, err := redis.Get(ctx, redisKey).Result()
	if err != nil {
		return
	}

	var battle CaseBattleData
	if err := json.Unmarshal([]byte(raw), &battle); err != nil {
		return
	}

	type playerScore struct {
		id    string
		value float64
		team  int
	}

	var scores []playerScore
	for _, player := range battle.Players {
		pull, ok := battle.PlayerPulls[player.ID]
		if !ok {
			scores = append(scores, playerScore{id: player.ID, value: 0, team: getTeam(battle.TeamMode, player.Position)})
			continue
		}
		scores = append(scores, playerScore{id: player.ID, value: pull.TotalValue, team: getTeam(battle.TeamMode, player.Position)})
	}

	if battle.TeamMode == "2v2" {
		teamTotals := make(map[int]float64)
		for _, s := range scores {
			teamTotals[s.team] += s.value
		}
		winningTeam := 1
		if battle.Crazy {
			if teamTotals[2] < teamTotals[1] {
				winningTeam = 2
			}
		} else {
			if teamTotals[2] > teamTotals[1] {
				winningTeam = 2
			}
		}

		totalPot := teamTotals[1] + teamTotals[2]
		var winners []WinnerInfo
		winnersCount := 0
		for _, s := range scores {
			if s.team == winningTeam {
				winnersCount++
			}
		}
		share := totalPot / float64(winnersCount)
		for _, s := range scores {
			if s.team == winningTeam {
				winners = append(winners, WinnerInfo{PlayerID: s.id, AmountWon: share})
			}
		}
		battle.WinnersInfo = winners
	} else {
		if battle.Crazy {
			sort.Slice(scores, func(i, j int) bool { return scores[i].value < scores[j].value })
		} else {
			sort.Slice(scores, func(i, j int) bool { return scores[i].value > scores[j].value })
		}

		totalPot := 0.0
		for _, s := range scores {
			totalPot += s.value
		}

		battle.WinnersInfo = []WinnerInfo{{PlayerID: scores[0].id, AmountWon: totalPot}}
	}

	now := time.Now().UnixMilli()
	battle.Status = "completed"
	battle.CompletedAt = now
	battle.UpdatedAt = now

	data, _ := json.Marshal(battle)
	redis.Set(ctx, redisKey, string(data), 60*time.Second)

	log.Printf("[CaseBattle] Battle %s completed with winner(s): %v", battleID, winnersStr(battle.WinnersInfo))
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

func getTeam(teamMode string, position int) int {
	switch teamMode {
	case "2v2":
		if position <= 2 {
			return 1
		}
		return 2
	default:
		return position
	}
}
