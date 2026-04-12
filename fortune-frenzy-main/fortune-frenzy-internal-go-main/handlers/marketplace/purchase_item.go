package marketplace

import (
	"ffinternal-go/service"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
)

func PurchaseItem(c *fiber.Ctx) error {
	userAssetID := c.Params("uaid")
	if userAssetID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user_asset_id"})
	}

	type RequestBody struct {
		BuyerID interface{} `json:"buyer_id"`
	}
	var body RequestBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing or invalid body"})
	}

	buyerIDStr := ""
	switch v := body.BuyerID.(type) {
	case float64:
		buyerIDStr = strconv.FormatInt(int64(v), 10)
	case string:
		buyerIDStr = v
	}
	if buyerIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid buyer_id"})
	}

	con, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer con.Close()

	tx, err := con.BeginTx(c.Context(), nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback()

	var listingUAID, listingItemID, listingSellerID, listingCurrency string
	var listingPrice int64
	var listingListedAt time.Time
	var listingExpiresAt *time.Time

	err = tx.QueryRowContext(c.Context(),
		"SELECT user_asset_id, item_id, seller_id, price, currency, listed_at, expires_at FROM item_listings WHERE user_asset_id = ? FOR UPDATE",
		userAssetID,
	).Scan(&listingUAID, &listingItemID, &listingSellerID, &listingPrice, &listingCurrency, &listingListedAt, &listingExpiresAt)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Listing not found"})
	}

	if listingExpiresAt != nil && listingExpiresAt.Before(time.Now()) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Listing has expired"})
	}

	_, err = tx.ExecContext(c.Context(),
		"UPDATE item_copies SET owner_id = ? WHERE user_asset_id = ?",
		buyerIDStr, userAssetID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	_, err = tx.ExecContext(c.Context(),
		"DELETE FROM item_listings WHERE user_asset_id = ?",
		userAssetID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	sellerPayout := float64(listingPrice) * 0.7
	_, err = tx.ExecContext(c.Context(),
		"INSERT INTO external_cash_change_requests (user_id, amount, status) VALUES (?, ?, 'pending')",
		listingSellerID, sellerPayout,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	if err = tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"success": true, "status": "OK"})
}
