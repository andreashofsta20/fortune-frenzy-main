package marketplace

import (
	"fmt"
	"ffinternal-go/models"
	"ffinternal-go/service"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
)

func GetAllItems(c *fiber.Ctx) error {
	if c.Query("monitoring") == "true" {
		return getMonitoredItems(c)
	}

	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer conn.Close()

	rows, err := conn.QueryContext(c.Context(), catalogItemsSelect)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	items := make([]models.Item, 0)
	for rows.Next() {
		var item models.Item
		var allowShop int8
		if err := rows.Scan(&item.ID, &item.AssetID, &item.Name, &item.Creator, &item.Description, &item.AveragePrice, &item.TotalUnboxed, &item.MaximumCopies, &item.Value, &item.CreatedAt, &item.UpdatedAt, &item.Color, &item.Category, &item.CopiesInCirculation, &allowShop); err != nil {
			continue
		}
		item.AllowDirectShopPurchase = int(allowShop)
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "OK", "data": items})
}

func getMonitoredItems(c *fiber.Ctx) error {
	serverID := c.Query("id")
	if serverID == "" {
		return c.JSON(fiber.Map{"status": "OK", "data": []models.Item{}})
	}

	redis := service.GetRedisConnection()
	ctx := c.Context()
	key := fmt.Sprintf("marketplace:items:last_seen:%s", serverID)
	lastSeenRaw, _ := redis.Get(ctx, key).Result()

	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer conn.Close()

	nowUnix := time.Now().Unix()
	if lastSeenRaw == "" {
		redis.Set(ctx, key, strconv.FormatInt(nowUnix, 10), 24*time.Hour)
		return c.JSON(fiber.Map{"status": "OK", "data": []models.Item{}})
	}

	lastSeenUnix, err := strconv.ParseInt(lastSeenRaw, 10, 64)
	if err != nil {
		lastSeenUnix = 0
	}
	lastSeen := time.Unix(lastSeenUnix, 0).UTC()

	rows, err := conn.QueryContext(
		ctx,
		catalogItemsSelect+" WHERE i.updated_at > ? ORDER BY i.updated_at ASC",
		lastSeen,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	items := make([]models.Item, 0)
	for rows.Next() {
		var item models.Item
		var allowShop int8
		if err := rows.Scan(&item.ID, &item.AssetID, &item.Name, &item.Creator, &item.Description, &item.AveragePrice, &item.TotalUnboxed, &item.MaximumCopies, &item.Value, &item.CreatedAt, &item.UpdatedAt, &item.Color, &item.Category, &item.CopiesInCirculation, &allowShop); err != nil {
			continue
		}
		item.AllowDirectShopPurchase = int(allowShop)
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	redis.Set(ctx, key, strconv.FormatInt(nowUnix, 10), 24*time.Hour)
	return c.JSON(fiber.Map{"status": "OK", "data": items})
}
