package marketplace

import (
	"database/sql"
	"ffinternal-go/service"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

func GetListings(c *fiber.Ctx) error {
	itemID := c.Params("id")

	con, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer con.Close()

	var query string
	var args []any
	if itemID != "" {
		query = `SELECT il.user_asset_id, il.item_id, il.seller_id, il.price, il.currency, il.listed_at, il.expires_at,
		         u.name, u.display_name
		         FROM item_listings il LEFT JOIN users u ON il.seller_id = u.user_id
		         WHERE il.item_id = ? AND (il.expires_at > NOW() OR il.expires_at IS NULL)`
		args = append(args, itemID)
	} else {
		query = `SELECT il.user_asset_id, il.item_id, il.seller_id, il.price, il.currency, il.listed_at, il.expires_at,
		         u.name, u.display_name
		         FROM item_listings il LEFT JOIN users u ON il.seller_id = u.user_id
		         WHERE il.expires_at > NOW() OR il.expires_at IS NULL`
	}

	rows, err := con.QueryContext(c.Context(), query, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type ListingEntry struct {
		UserAssetID string     `json:"user_asset_id"`
		ItemID      string     `json:"item_id"`
		SellerID    string     `json:"seller_id"`
		Price       string     `json:"price"`
		Currency    string     `json:"currency"`
		CreatedAt   time.Time  `json:"created_at"`
		ExpiresAt   *time.Time `json:"expires_at,omitempty"`
		Username    string     `json:"username"`
		DisplayName string     `json:"display_name"`
	}

	listings := make([]ListingEntry, 0)
	for rows.Next() {
		var l ListingEntry
		var username, displayName sql.NullString
		var price int64
		if err := rows.Scan(&l.UserAssetID, &l.ItemID, &l.SellerID, &price, &l.Currency, &l.CreatedAt, &l.ExpiresAt, &username, &displayName); err != nil {
			continue
		}
		l.Price = strconv.FormatInt(price, 10)
		l.Username = "Unknown"
		if username.Valid && strings.TrimSpace(username.String) != "" {
			l.Username = username.String
		}
		l.DisplayName = "Unknown"
		if displayName.Valid && strings.TrimSpace(displayName.String) != "" {
			l.DisplayName = displayName.String
		}
		listings = append(listings, l)
	}

	return c.JSON(fiber.Map{"status": "OK", "listings": listings})
}
