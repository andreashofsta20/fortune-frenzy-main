package users

import (
	"ffinternal-go/service"
	"strconv"

	"github.com/gofiber/fiber/v2"
)

func GetInventory(c *fiber.Ctx) error {
	userID := c.Params("userId")
	if userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user ID"})
	}

	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to the database"})
	}
	defer conn.Close()

	rows, err := conn.QueryContext(c.Context(),
		"SELECT item_id, user_asset_id, serial_number, copy_id FROM item_copies WHERE owner_id = ?", userID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to query inventory"})
	}
	defer rows.Close()

	inventory := make([][]string, 0)
	for rows.Next() {
		var itemID, userAssetID, copyID string
		var serialNumber int
		if err := rows.Scan(&itemID, &userAssetID, &serialNumber, &copyID); err != nil {
			continue
		}
		inventory = append(inventory, []string{itemID, userAssetID, strconv.Itoa(serialNumber), copyID})
	}
	if err = rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read inventory"})
	}

	return c.JSON(fiber.Map{
		"status":    "OK",
		"inventory": inventory,
	})
}
