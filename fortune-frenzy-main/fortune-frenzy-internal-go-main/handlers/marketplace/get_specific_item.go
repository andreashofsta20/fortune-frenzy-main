package marketplace

import (
	"database/sql"
	"ffinternal-go/models"
	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
)

func GetItemByID(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing item ID"})
	}

	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer conn.Close()

	var item models.Item
	err = conn.QueryRowContext(c.Context(), "SELECT id, asset_id, name, creator, description, average_price, total_unboxed, maximum_copies, value, created_at, updated_at, color, category FROM items WHERE id = ?", id).Scan(&item.ID, &item.AssetID, &item.Name, &item.Creator, &item.Description, &item.AveragePrice, &item.TotalUnboxed, &item.MaximumCopies, &item.Value, &item.CreatedAt, &item.UpdatedAt, &item.Color, &item.Category)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Item not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "OK", "data": item})
}
