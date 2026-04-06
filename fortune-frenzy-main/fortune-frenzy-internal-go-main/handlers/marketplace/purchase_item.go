package marketplace

import (
	"ffinternal-go/models"
	"ffinternal-go/service"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
)

func PurchaseItem(c *fiber.Ctx) error {
	userAssetID := c.Params("uaid")
	if userAssetID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing user_asset_id in parameters",
		})
	}

	type RequestBody struct {
		BuyerID *string `json:"buyer_id"`
	}
	var body RequestBody
	if err := c.BodyParser(&body); err != nil || body.BuyerID == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing or invalid body",
		})
	}

	buyerID, err := strconv.ParseInt(*body.BuyerID, 10, 64)
	if err != nil || buyerID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid buyer_id",
		})
	}

	con, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	defer con.Close()

	tx, err := con.BeginTx(c.Context(), nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	var listing models.ItemListing
	err = tx.QueryRowContext(c.Context(),
		"SELECT * FROM item_listings WHERE user_asset_id = ? FOR UPDATE",
		userAssetID,
	).Scan(&listing.UserAssetID, &listing.SellerID, &listing.Currency, &listing.CreatedAt, &listing.ExpiresAt, &listing.Price, &listing.ItemID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Listing not found",
		})
	}

	if listing.ExpiresAt != nil && listing.ExpiresAt.Before(time.Now()) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Listing has expired",
		})
	}

	_, err = tx.ExecContext(c.Context(),
		"UPDATE item_copies SET owner_id = ? WHERE user_asset_id = ?",
		buyerID, userAssetID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	_, err = tx.ExecContext(c.Context(),
		"DELETE FROM item_listings WHERE user_asset_id = ?",
		userAssetID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	amount, err := strconv.ParseFloat(listing.Price, 64)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	amount = amount * 0.7
	_, err = tx.ExecContext(c.Context(),
		"INSERT INTO external_cash_change_requests (user_id, amount, status) VALUES (?, ?, 'pending')",
		listing.SellerID, amount,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	if err = tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{"success": true})
}
