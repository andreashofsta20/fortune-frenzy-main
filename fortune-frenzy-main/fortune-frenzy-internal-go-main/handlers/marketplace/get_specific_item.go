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
	var allowShop int8
	err = conn.QueryRowContext(c.Context(), catalogItemsSelect+" WHERE i.id = ?", id).Scan(&item.ID, &item.AssetID, &item.Name, &item.Creator, &item.Description, &item.AveragePrice, &item.TotalUnboxed, &item.MaximumCopies, &item.Value, &item.CreatedAt, &item.UpdatedAt, &item.Color, &item.Category, &item.CopiesInCirculation, &allowShop)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Item not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	item.AllowDirectShopPurchase = int(allowShop)

	return c.JSON(fiber.Map{"status": "OK", "data": item})
}
