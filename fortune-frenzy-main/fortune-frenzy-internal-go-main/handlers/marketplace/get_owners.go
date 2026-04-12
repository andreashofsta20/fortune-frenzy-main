package marketplace

import (
	"database/sql"
	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
)

func GetOwners(c *fiber.Ctx) error {
	itemID := c.Params("id")
	if itemID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing item ID"})
	}

	con, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer con.Close()

	rows, err := con.QueryContext(c.Context(),
		`SELECT i.user_asset_id, i.item_id, i.owner_id, i.serial_number, i.copy_id,
		        u.name, u.display_name
		 FROM item_copies i
		 LEFT JOIN users u ON i.owner_id = u.user_id
		 WHERE i.item_id = ?`, itemID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type OwnerEntry struct {
		UserAssetID  string  `json:"user_asset_id"`
		ItemID       string  `json:"item_id"`
		OwnerID      string  `json:"owner_id"`
		SerialNumber int     `json:"serial_number"`
		CopyID       string  `json:"copy_id"`
		Username     *string `json:"username,omitempty"`
		DisplayName  *string `json:"display_name,omitempty"`
	}

	owners := make([]OwnerEntry, 0)
	for rows.Next() {
		var o OwnerEntry
		var username, displayName sql.NullString
		if err := rows.Scan(&o.UserAssetID, &o.ItemID, &o.OwnerID, &o.SerialNumber, &o.CopyID, &username, &displayName); err != nil {
			continue
		}
		if username.Valid {
			o.Username = &username.String
		}
		if displayName.Valid {
			o.DisplayName = &displayName.String
		}
		owners = append(owners, o)
	}

	return c.JSON(fiber.Map{"status": "OK", "owners": owners})
}
