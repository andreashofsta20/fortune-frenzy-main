package marketplace

import (
	"ffinternal-go/models"
	"ffinternal-go/service"
	"strconv"

	"github.com/gofiber/fiber/v2"
)

func GetListings(c *fiber.Ctx) error {
	var id *int
	idStr := c.Params("id")
	if idStr != "" {
		parsedId, err := strconv.Atoi(idStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid item ID"})
		}
		id = &parsedId
	}

	con, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer con.Close()

	var query string
	var args []any
	if id != nil {
		query = "SELECT il.*, u.name AS username, u.display_name FROM item_listings il LEFT JOIN users u ON il.seller_id = u.user_id WHERE il.item_id = ? AND (il.expires_at > NOW() OR il.expires_at IS NULL);"
		args = append(args, *id)
	} else {
		query = "SELECT il.*, u.name AS username, u.display_name FROM item_listings il LEFT JOIN users u ON il.seller_id = u.user_id WHERE il.expires_at > NOW() OR il.expires_at IS NULL;"
	}

	rows, err := con.QueryContext(c.Context(), query, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	listings := make([]models.ItemListing, 0)
	for rows.Next() {
		var listing models.ItemListing
		if err := rows.Scan(&listing.UserAssetID, &listing.SellerID, &listing.Currency, &listing.CreatedAt, &listing.ExpiresAt, &listing.Price, &listing.ItemID, &listing.Username, &listing.DisplayName); err != nil {
			continue
		}
		listings = append(listings, listing)
	}

	return c.JSON(fiber.Map{"status": "OK", "listings": listings})
}
