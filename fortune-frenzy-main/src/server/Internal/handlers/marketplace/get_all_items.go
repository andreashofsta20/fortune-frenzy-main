package marketplace

import (
	"ffinternal-go/models"
	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
)

func GetAllItems(c *fiber.Ctx) error {
	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer conn.Close()

	rows, err := conn.QueryContext(c.Context(), "SELECT id, asset_id, name, creator, description, average_price, total_unboxed, maximum_copies, value, created_at, color FROM items")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var items []models.Item
	for rows.Next() {
		var item models.Item
		if err := rows.Scan(&item.ID, &item.AssetID, &item.Name, &item.Creator, &item.Description, &item.AveragePrice, &item.TotalUnboxed, &item.MaximumCopies, &item.Value, &item.CreatedAt, &item.Color); err != nil {
			continue
		}
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "OK", "data": items})
}
