package users

import (
	"errors"
	"ffinternal-go/service"
	"fmt"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/mongo"
)

type walletBootstrapBody struct {
	ProfileCash interface{} `json:"profile_cash"`
}

type walletAdjustBody struct {
	Delta interface{} `json:"delta"`
}

// mongoWalletErrMessage turns Mongo “not authorized” into an actionable hint (Atlas readWrite on MONGODB_DATABASE).
func mongoWalletErrMessage(err error) string {
	if err == nil {
		return ""
	}
	var ce mongo.CommandError
	if errors.As(err, &ce) && ce.Code == 13 {
		return "MongoDB user lacks permission: grant built-in role readWrite on the database in MONGODB_DATABASE (e.g. fortune_frenzy). See SETUP_GUIDE.md → MongoDB Atlas."
	}
	if strings.Contains(strings.ToLower(err.Error()), "not authorized") {
		return "MongoDB user lacks permission: grant built-in role readWrite on the database in MONGODB_DATABASE (e.g. fortune_frenzy). See SETUP_GUIDE.md → MongoDB Atlas."
	}
	return err.Error()
}

func parseInt64Field(v interface{}) (int64, error) {
	switch x := v.(type) {
	case float64:
		return int64(x), nil
	case string:
		return strconv.ParseInt(strings.TrimSpace(x), 10, 64)
	case int:
		return int64(x), nil
	case int64:
		return x, nil
	default:
		return 0, fmt.Errorf("invalid number")
	}
}

// BootstrapWallet POST — first join: seed Mongo from Roblox profile; else return authoritative Mongo cash.
func BootstrapWallet(c *fiber.Ctx) error {
	if !service.MongoWalletEnabled() {
		return c.JSON(fiber.Map{"status": "OK", "mongo_wallet": false})
	}
	userID := c.Params("userId")
	if userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user ID"})
	}
	var body walletBootstrapBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	pc, err := parseInt64Field(body.ProfileCash)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid profile_cash"})
	}
	cash, err := service.WalletBootstrap(c.Context(), userID, pc)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": mongoWalletErrMessage(err)})
	}
	return c.JSON(fiber.Map{"status": "OK", "mongo_wallet": true, "cash": cash})
}

// GetWallet GET — read-only balance for in-game sync (no document create).
func GetWallet(c *fiber.Ctx) error {
	if !service.MongoWalletEnabled() {
		return c.JSON(fiber.Map{"status": "OK", "mongo_wallet": false})
	}
	userID := c.Params("userId")
	if userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user ID"})
	}
	cash, gems, found, err := service.WalletGetBalance(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": mongoWalletErrMessage(err)})
	}
	return c.JSON(fiber.Map{
		"status":         "OK",
		"mongo_wallet":   true,
		"cash":           cash,
		"gems":           gems,
		"wallet_exists":  found,
	})
}

// AdjustWallet POST — apply a signed delta (trusted server key only).
func AdjustWallet(c *fiber.Ctx) error {
	if !service.MongoWalletEnabled() {
		return c.JSON(fiber.Map{"status": "OK", "mongo_wallet": false})
	}
	userID := c.Params("userId")
	if userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user ID"})
	}
	var body walletAdjustBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	delta, err := parseInt64Field(body.Delta)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid delta"})
	}
	cash, err := service.WalletAdjustCash(c.Context(), userID, delta)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": mongoWalletErrMessage(err)})
	}
	return c.JSON(fiber.Map{"status": "OK", "mongo_wallet": true, "cash": cash})
}
