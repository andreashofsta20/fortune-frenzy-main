package utilities

import (
	"os"
	"strings"
)

// DefaultCoinflipHouseUserID is the Roblox user_id that receives items when a coinflip bot wins.
// Override with env COINFLIP_BOT_WIN_USER_ID. This account is excluded from leaderboard queries.
const DefaultCoinflipHouseUserID = "10806687448"

func CoinflipHouseUserID() string {
	s := strings.TrimSpace(os.Getenv("COINFLIP_BOT_WIN_USER_ID"))
	if s != "" {
		return s
	}
	return DefaultCoinflipHouseUserID
}
