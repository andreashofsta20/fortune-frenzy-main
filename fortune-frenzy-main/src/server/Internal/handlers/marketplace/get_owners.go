package marketplace

import (
	"ffinternal-go/models"
	"ffinternal-go/service"
	"strconv"

	"github.com/gofiber/fiber/v2"
)

func GetOwners(c *fiber.Ctx) error {
	idStr := c.Params("id")

	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid item ID"})
	}

	con, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer con.Close()

	rows, err := con.QueryContext(c.Context(), "SELECT i.*, u.name AS username, u.display_name FROM item_copies i LEFT JOIN users u ON i.owner_id = u.user_id WHERE i.item_id = ?;", id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	owners := make([]models.ItemOwner, 0)
	for rows.Next() {
		var owner models.ItemOwner
		if err := rows.Scan(&owner.CopyID, &owner.ItemID, &owner.OwnerID, &owner.UserAssetID, &owner.AcquiredAt, &owner.SerialNumber, &owner.Username, &owner.DisplayName); err != nil {
			continue
		}
		owners = append(owners, owner)
	}

	return c.JSON(fiber.Map{"status": "OK", "owners": owners})
}
