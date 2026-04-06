package utilities

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"ffinternal-go/models"
	"ffinternal-go/service"
)

func GetUserInfo(ctx context.Context, db *sql.Conn, userIDs []string) ([]models.UserInfo, error) {
	redis := service.GetRedisConnection()

	redisKeys := make([]string, len(userIDs))
	for i, id := range userIDs {
		redisKeys[i] = "userInfo:" + id
	}

	cachedResults, err := redis.MGet(ctx, redisKeys...).Result()
	if err != nil {
		return nil, err
	}

	results := make([]models.UserInfo, 0, len(userIDs))
	uncachedUserIDs := make([]string, 0)

	for i, cached := range cachedResults {
		if cached != nil {
			parts := strings.SplitN(cached.(string), ":", 2)
			if len(parts) == 2 {
				username := parts[0]
				displayName := parts[1]
				idStr := userIDs[i]
				results = append(results, models.UserInfo{
					ID:          &idStr,
					Username:    &username,
					DisplayName: &displayName,
				})
			}
		} else {
			uncachedUserIDs = append(uncachedUserIDs, userIDs[i])
		}
	}

	if len(uncachedUserIDs) > 0 {
		query := "SELECT user_id, name, display_name FROM users WHERE user_id IN (?" + strings.Repeat(",?", len(uncachedUserIDs)-1) + ")"
		rows, err := db.QueryContext(ctx, query, ToInterfaceSlice(uncachedUserIDs)...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		pipe := redis.TxPipeline()
		userMap := make(map[string]models.UserInfo)
		for rows.Next() {
			var userID, name, displayName string
			if err := rows.Scan(&userID, &name, &displayName); err != nil {
				continue
			}
			user := models.UserInfo{
				ID:          &userID,
				Username:    &name,
				DisplayName: &displayName,
			}
			results = append(results, user)
			userMap[userID] = user
			pipe.Set(ctx, "userInfo:"+userID, name+":"+displayName, 600*time.Second)
		}
		_, err = pipe.Exec(ctx)
		if err != nil {
			return nil, err
		}

		for _, id := range uncachedUserIDs {
			if _, exists := userMap[id]; !exists {
				unknown := "Unknown Username"
				unknownDisp := "Unknown Disp. Name"
				idStr := id
				results = append(results, models.UserInfo{
					ID:          &idStr,
					Username:    &unknown,
					DisplayName: &unknownDisp,
				})
			}
		}
	}

	return results, nil
}
