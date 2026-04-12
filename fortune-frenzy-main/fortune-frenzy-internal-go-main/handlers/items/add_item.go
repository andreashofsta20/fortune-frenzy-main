package items

import (
	"crypto/rand"
	"ffinternal-go/service"
	"math/big"

	"github.com/gofiber/fiber/v2"
)

const alphanumeric = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

func randomAlphanumeric(length int) (string, error) {
	b := make([]byte, length)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphanumeric))))
		if err != nil {
			return "", err
		}
		b[i] = alphanumeric[n.Int64()]
	}
	return string(b), nil
}

type AddItemRequestBody struct {
	UserID string `json:"user_id"`
	ItemID string `json:"item_id"`
}

func AddItem(c *fiber.Ctx) error {
	var body AddItemRequestBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if body.UserID == "" || body.ItemID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "user_id and item_id are required"})
	}

	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	_, err = db.ExecContext(c.Context(),
		"INSERT INTO item_serials (item_id, next_serial) VALUES (?, 1) ON DUPLICATE KEY UPDATE next_serial = next_serial",
		body.ItemID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to initialize serial"})
	}

	result, err := db.ExecContext(c.Context(),
		"UPDATE item_serials SET next_serial = next_serial + 1 WHERE item_id = ?",
		body.ItemID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to increment serial"})
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to get serial number"})
	}

	var serial int
	err = db.QueryRowContext(c.Context(),
		"SELECT next_serial - 1 FROM item_serials WHERE item_id = ?",
		body.ItemID,
	).Scan(&serial)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read serial number"})
	}

	uaidSuffix, err := randomAlphanumeric(18)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate UAID"})
	}
	uaid := "FF" + uaidSuffix

	copyIDSuffix, err := randomAlphanumeric(18)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate copy ID"})
	}
	copyID := "FF" + copyIDSuffix

	_, err = db.ExecContext(c.Context(),
		"INSERT INTO item_copies (user_asset_id, item_id, owner_id, serial_number, copy_id) VALUES (?, ?, ?, ?, ?)",
		uaid, body.ItemID, body.UserID, serial, copyID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to insert item copy"})
	}

	return c.JSON(fiber.Map{
		"status":        "OK",
		"user_asset_id": uaid,
	})
}
