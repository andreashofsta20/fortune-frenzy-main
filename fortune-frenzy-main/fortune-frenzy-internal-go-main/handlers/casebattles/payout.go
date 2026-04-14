package casebattles

import (
	"context"
	"log"
	"math"
	"strconv"
	"strings"
	"time"

	"ffinternal-go/service"
)

const caseBattlePayoutSettledKeyPrefix = "casebattle_settled:"

// settleCaseBattleWinners credits winners once per battle (Redis SETNX). Skips bots and non-numeric ids.
func settleCaseBattleWinners(ctx context.Context, battleID string, winners []WinnerInfo) {
	if len(winners) == 0 {
		return
	}

	rdb := service.GetRedisConnection()
	key := caseBattlePayoutSettledKeyPrefix + battleID
	ok, err := rdb.SetNX(ctx, key, "1", 7*24*time.Hour).Result()
	if err != nil {
		log.Printf("[CaseBattle] payout SETNX %s: %v", battleID, err)
		return
	}
	if !ok {
		return
	}

	for _, w := range winners {
		if w.AmountWon <= 0 {
			continue
		}
		uid := strings.TrimSpace(w.PlayerID)
		if uid == "" || strings.HasPrefix(uid, "BOT_") {
			continue
		}
		if _, err := strconv.ParseInt(uid, 10, 64); err != nil {
			log.Printf("[CaseBattle] skip payout non-numeric user %q battle %s", uid, battleID)
			continue
		}
		amt := int64(math.Round(w.AmountWon))
		if amt <= 0 {
			continue
		}

		if service.MongoWalletEnabled() {
			if _, err := service.WalletAdjustCash(ctx, uid, amt); err != nil {
				log.Printf("[CaseBattle] WalletAdjustCash battle=%s user=%s amt=%d: %v", battleID, uid, amt, err)
			}
		} else {
			if err := queueMariaDBCashChange(ctx, uid, amt); err != nil {
				log.Printf("[CaseBattle] cash_changes battle=%s user=%s amt=%d: %v", battleID, uid, amt, err)
			}
		}
	}
}

func queueMariaDBCashChange(ctx context.Context, userID string, delta int64) error {
	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return err
	}
	defer conn.Close()
	_, err = conn.ExecContext(ctx,
		"INSERT INTO cash_changes (user_id, amount, consumed) VALUES (?, ?, false)",
		userID, delta,
	)
	return err
}
