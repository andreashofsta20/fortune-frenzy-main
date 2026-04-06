package utilities

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"ffinternal-go/service"
)

func GetItemString(ctx context.Context, db *sql.Conn, uaids []string) ([]string, error) {
	redis := service.GetRedisConnection()

	redisKeys := make([]string, len(uaids))
	for i, uaid := range uaids {
		redisKeys[i] = "itemCopy:" + uaid
	}

	cachedResults, err := redis.MGet(ctx, redisKeys...).Result()
	if err != nil {
		return nil, err
	}

	results := make([]string, 0, len(uaids))
	uncachedUaids := make([]string, 0)

	for i, cached := range cachedResults {
		if cached != nil {
			results = append(results, cached.(string))
		} else {
			uncachedUaids = append(uncachedUaids, uaids[i])
		}
	}

	if len(uncachedUaids) > 0 {
		query := "SELECT item_id, user_asset_id FROM item_copies WHERE user_asset_id IN (?" + strings.Repeat(",?", len(uncachedUaids)-1) + ")"
		rows, err := db.QueryContext(ctx, query, ToInterfaceSlice(uncachedUaids)...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		pipe := redis.TxPipeline()
		for rows.Next() {
			var itemID, userAssetID string
			if err := rows.Scan(&itemID, &userAssetID); err != nil {
				continue
			}
			value := userAssetID + ":" + itemID
			results = append(results, value)
			pipe.Set(ctx, "itemCopy:"+userAssetID, value, 7200*time.Second)
		}
		_, err = pipe.Exec(ctx)
		if err != nil {
			return nil, err
		}
	}

	return results, nil
}
