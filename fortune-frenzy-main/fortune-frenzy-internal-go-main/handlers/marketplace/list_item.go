package marketplace

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"ffinternal-go/service"
	"ffinternal-go/utilities"
	"time"

	"github.com/gofiber/fiber/v2"
)

func ListItem(c *fiber.Ctx) error {
	userAssetID := c.Params("uaid")

	if userAssetID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing user_asset_id in parameters",
		})
	}

	type RequestBody struct {
		Price  *float64 `json:"price"`
		Expiry *int64   `json:"expiry"`
	}
	raw := bytes.TrimSpace(c.Body())
	// Packet / Luau may send null, empty body, or (rarely) [] for an empty table — none decode as a JSON object.
	if len(raw) == 0 || bytes.Equal(raw, []byte("null")) || bytes.Equal(raw, []byte("[]")) {
		raw = []byte("{}")
	}
	var body RequestBody
	if err := json.Unmarshal(raw, &body); err != nil {
		var arr []json.RawMessage
		if json.Unmarshal(raw, &arr) == nil {
			raw = []byte("{}")
			if err := json.Unmarshal(raw, &body); err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing or invalid body"})
			}
		} else {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing or invalid body"})
		}
	}

	con, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	defer con.Close()

	if body.Price == nil {
		result, err := con.ExecContext(c.Context(),
			"DELETE FROM item_listings WHERE user_asset_id = ?",
			userAssetID,
		)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": err.Error(),
			})
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "No listing found for " + userAssetID,
			})
		}

		return c.JSON(fiber.Map{"status": "OK"})
	}

	if *body.Price <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid price, must be a positive number",
		})
	}

	rdb := service.GetRedisConnection()
	if err := utilities.CheckItemsNotStaked(c.Context(), rdb, []string{userAssetID}); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Item is in use (coinflip, jackpot, or pending trade)",
		})
	}

	var itemID string
	var sellerID int64
	if err := con.QueryRowContext(
		c.Context(),
		"SELECT item_id, owner_id FROM item_copies WHERE user_asset_id = ?",
		userAssetID,
	).Scan(&itemID, &sellerID); err != nil {
		if err == sql.ErrNoRows {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "user_asset_id not found",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	var expiresAt any
	if body.Expiry != nil {
		currentTime := time.Now().Unix()
		if *body.Expiry <= currentTime {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid expiry, must be a future timestamp",
			})
		}
		expiresAt = time.Unix(*body.Expiry, 0)
	} else {
		expiresAt = nil
	}

	query := `
		INSERT INTO item_listings (user_asset_id, item_id, seller_id, currency, expires_at, price)
		VALUES (?, ?, ?, "cash", ?, ?)
		ON DUPLICATE KEY UPDATE
			item_id = VALUES(item_id),
			seller_id = VALUES(seller_id),
			price = VALUES(price),
			expires_at = VALUES(expires_at);
	`
	_, err = con.ExecContext(c.Context(), query, userAssetID, itemID, sellerID, expiresAt, int64(*body.Price))
	if err != nil {
		if err.Error() == "No matching owner found for this user_asset_id" {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"error": "user_asset_id not found",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{"status": "OK"})
}
