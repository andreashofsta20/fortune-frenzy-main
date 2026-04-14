package marketplace

import (
	"database/sql"
	"ffinternal-go/service"
	"log"
	"math"
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
	if buyerIDStr == "" || buyerIDStr == "0" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid buyer_id"})
	}
	buyerID, err := strconv.ParseInt(buyerIDStr, 10, 64)
	if err != nil || buyerID == 0 {
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

	var (
		listingSellerID  int64
		listingPrice     int64
		listingExpiresAt sql.NullTime
	)

	err = tx.QueryRowContext(c.Context(),
		"SELECT seller_id, price, expires_at FROM item_listings WHERE user_asset_id = ? FOR UPDATE",
		userAssetID,
	).Scan(&listingSellerID, &listingPrice, &listingExpiresAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Listing not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	if listingExpiresAt.Valid && listingExpiresAt.Time.Before(time.Now()) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Listing has expired"})
	}

	_, err = tx.ExecContext(c.Context(),
		"UPDATE item_copies SET owner_id = ? WHERE user_asset_id = ?",
		buyerID, userAssetID,
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

	sellerPayout := int64(math.Round(float64(listingPrice) * 0.7))

	if !service.MongoWalletEnabled() {
		_, err = tx.ExecContext(c.Context(),
			"INSERT INTO external_cash_change_requests (user_id, amount, reason) VALUES (?, ?, ?)",
			listingSellerID, sellerPayout, "marketplace_sale",
		)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
	}

	if err = tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	if service.MongoWalletEnabled() {
		sellerKey := strconv.FormatInt(listingSellerID, 10)
		if _, err := service.WalletAdjustCash(c.Context(), sellerKey, sellerPayout); err != nil {
			log.Printf("marketplace sale: Mongo seller credit failed user=%s payout=%d: %v", sellerKey, sellerPayout, err)
			fallback, fbErr := service.GetMariaDBConnection()
			if fbErr == nil {
				_, _ = fallback.ExecContext(c.Context(),
					"INSERT INTO external_cash_change_requests (user_id, amount, reason) VALUES (?, ?, ?)",
					listingSellerID, sellerPayout, "marketplace_sale",
				)
				fallback.Close()
			}
		}
	}

	return c.JSON(fiber.Map{"success": true, "status": "OK"})
}
