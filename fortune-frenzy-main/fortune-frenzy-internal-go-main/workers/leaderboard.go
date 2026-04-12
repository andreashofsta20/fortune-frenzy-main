package workers

import (
	"ffinternal-go/handlers/misc"
	"time"
)

const leaderboardRefreshInterval = 30 * time.Second

func StartLeaderboardWorker() {
	go func() {
		for {
			misc.RefreshLeaderboard()
			time.Sleep(leaderboardRefreshInterval)
		}
	}()
}
