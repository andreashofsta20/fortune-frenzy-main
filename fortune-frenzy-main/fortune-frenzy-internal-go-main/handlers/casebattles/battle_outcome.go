package casebattles

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

// teamFromPosition mirrors local-backend getCaseBattleTeamFromPosition (split "1v1v1", cumulative slots).
func teamFromPosition(teamMode string, position int) int {
	parts := strings.Split(teamMode, "v")
	cumulative := 0
	for i, seg := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(seg))
		if err != nil || n < 1 {
			n = 1
		}
		cumulative += n
		if position <= cumulative {
			return i + 1
		}
	}
	if len(parts) == 0 {
		return 1
	}
	return len(parts)
}

func uniqueTeams(battle *CaseBattleData) []int {
	seen := make(map[int]bool)
	var order []int
	for _, p := range battle.Players {
		t := teamFromPosition(battle.TeamMode, p.Position)
		if !seen[t] {
			seen[t] = true
			order = append(order, t)
		}
	}
	return order
}

func sumPullItems(pull PlayerPull) float64 {
	s := 0.0
	for _, it := range pull.Items {
		s += it.Value
	}
	return s
}

func secureRandFloat01() (float64, error) {
	n, err := secureRandInt(1_000_000_000)
	if err != nil {
		return 0, err
	}
	return float64(n) / 1e9, nil
}

func playerScoreForMode(battle *CaseBattleData, pull PlayerPull) float64 {
	switch battle.Mode {
	case "Showdown":
		lastIdx := len(battle.Cases) - 1
		if lastIdx < 0 {
			return 0
		}
		for _, it := range pull.Items {
			if it.CaseIndex == lastIdx {
				return it.Value
			}
		}
		return 0
	case "Randomized":
		return 0
	default:
		return sumPullItems(pull)
	}
}

func computeTeamScores(battle *CaseBattleData, full map[string]PlayerPull) (map[int]float64, error) {
	scores := make(map[int]float64)
	if battle.Mode == "Randomized" {
		for _, t := range uniqueTeams(battle) {
			r, err := secureRandFloat01()
			if err != nil {
				return nil, err
			}
			scores[t] = r
		}
		return scores, nil
	}
	for _, p := range battle.Players {
		pull := full[p.ID]
		t := teamFromPosition(battle.TeamMode, p.Position)
		scores[t] += playerScoreForMode(battle, pull)
	}
	return scores, nil
}

func totalPotValue(battle *CaseBattleData, full map[string]PlayerPull) float64 {
	total := 0.0
	for _, p := range battle.Players {
		total += sumPullItems(full[p.ID])
	}
	return total
}

func splitPotAmongWinners(total float64, winnerIDs []string) map[string]float64 {
	out := make(map[string]float64)
	n := len(winnerIDs)
	if n == 0 || total <= 0 {
		return out
	}
	split := math.Floor(total / float64(n))
	remaining := total
	for i, id := range winnerIDs {
		var share float64
		if i == n-1 {
			share = remaining
		} else {
			share = split
			remaining -= share
		}
		out[id] = share
	}
	return out
}

// computeResolvedOutcome matches local-backend completeCaseBattle winner + payout rules.
func computeResolvedOutcome(battle *CaseBattleData, full map[string]PlayerPull) ([]WinnerInfo, map[string]PlayerPull, error) {
	totalPot := totalPotValue(battle, full)

	var winnerIDs []string
	if battle.Mode == "Group" {
		for _, p := range battle.Players {
			winnerIDs = append(winnerIDs, p.ID)
		}
	} else {
		teamScores, err := computeTeamScores(battle, full)
		if err != nil {
			return nil, nil, err
		}
		if len(teamScores) == 0 {
			return []WinnerInfo{}, make(map[string]PlayerPull), nil
		}

		winningTeam := teamFromPosition(battle.TeamMode, battle.Players[0].Position)
		best := teamScores[winningTeam]
		useCrazy := battle.Crazy
		for team, score := range teamScores {
			if (!useCrazy && score > best) || (useCrazy && score < best) {
				winningTeam = team
				best = score
			}
		}
		for _, p := range battle.Players {
			if teamFromPosition(battle.TeamMode, p.Position) == winningTeam {
				winnerIDs = append(winnerIDs, p.ID)
			}
		}
	}

	payouts := splitPotAmongWinners(totalPot, winnerIDs)
	var winners []WinnerInfo
	for _, id := range winnerIDs {
		winners = append(winners, WinnerInfo{PlayerID: id, AmountWon: payouts[id]})
	}

	resolved := make(map[string]PlayerPull, len(full))
	for _, p := range battle.Players {
		src := full[p.ID]
		items := make([]PullItem, len(src.Items))
		copy(items, src.Items)
		resolved[p.ID] = PlayerPull{
			Items:      items,
			TotalValue: payouts[p.ID],
		}
	}

	return winners, resolved, nil
}

// visiblePullsFromResolved builds cumulative revealed pulls for case indices 0..maxCaseIdx (local-backend behavior).
func visiblePullsFromResolved(resolved map[string]PlayerPull, maxCaseIdx int) map[string]PlayerPull {
	out := make(map[string]PlayerPull)
	for pid, rp := range resolved {
		var items []PullItem
		for _, it := range rp.Items {
			if it.CaseIndex <= maxCaseIdx {
				items = append(items, it)
			}
		}
		sum := 0.0
		for _, it := range items {
			sum += it.Value
		}
		out[pid] = PlayerPull{Items: items, TotalValue: sum}
	}
	return out
}

// completionPlayerPulls exposes full item history with per-player payout as total_value (matches local on complete).
func completionPlayerPulls(resolved map[string]PlayerPull) map[string]PlayerPull {
	out := make(map[string]PlayerPull)
	for pid, rp := range resolved {
		items := make([]PullItem, len(rp.Items))
		copy(items, rp.Items)
		out[pid] = PlayerPull{Items: items, TotalValue: rp.TotalValue}
	}
	return out
}

// PrepareStartedCaseBattle fills resolved pulls, winners, visible first round, and spin metadata (local-backend semantics).
func PrepareStartedCaseBattle(battle *CaseBattleData, caseDataMap map[string]CaseBattleCase) error {
	full := make(map[string]PlayerPull)
	for _, player := range battle.Players {
		pull, err := computePlayerPulls(player.ID, player.ClientSeed, battle.ServerSeed, battle.Cases, caseDataMap)
		if err != nil {
			return fmt.Errorf("compute pulls: %w", err)
		}
		full[player.ID] = pull
	}

	n := len(battle.Cases)
	now := time.Now().UnixMilli()
	battle.Status = "in_progress"
	battle.StartedAt = now
	battle.WinnersInfo = nil

	if n == 0 {
		winners, resolved, err := computeResolvedOutcome(battle, full)
		if err != nil {
			return err
		}
		battle.PlayerPulls = completionPlayerPulls(resolved)
		battle.WinnersInfo = winners
		if battle.WinnersInfo == nil {
			battle.WinnersInfo = []WinnerInfo{}
		}
		battle.ResolvedPulls = nil
		battle.ResolvedWinners = nil
		battle.Status = "completed"
		battle.CompletedAt = now
		battle.UpdatedAt = now
		battle.NextStepAt = nil
		battle.SpinData = SpinData{CurrentCaseIndex: 0, CaseID: "", Progress: "0"}
		return nil
	}

	winners, resolved, err := computeResolvedOutcome(battle, full)
	if err != nil {
		return err
	}
	battle.ResolvedPulls = resolved
	battle.ResolvedWinners = winners
	battle.PlayerPulls = visiblePullsFromResolved(resolved, 0)

	firstCaseID := battle.Cases[0]
	battle.SpinData = SpinData{
		CurrentCaseIndex: 0,
		CaseID:           firstCaseID,
		Progress:         "1",
	}
	step := getStepDuration(battle.FastMode)
	ns := now + step
	battle.NextStepAt = &ns
	battle.UpdatedAt = now
	return nil
}

// redactCaseBattleForClient strips server-only fields (matches local-backend: clients only see record.data).
func redactCaseBattleForClient(b CaseBattleData) CaseBattleData {
	b.ResolvedPulls = nil
	b.ResolvedWinners = nil
	return b
}
