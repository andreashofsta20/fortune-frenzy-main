package users

import (
	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
)

type RegisterRequestBody struct {
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	Country     string `json:"country"`
}

func RegisterUser(c *fiber.Ctx) error {
	userID := c.Params("userId")
	if userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user ID"})
	}

	var body RegisterRequestBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to the database"})
	}
	defer conn.Close()

	_, err = conn.ExecContext(c.Context(),
		`INSERT INTO users (user_id, name, display_name, country) VALUES (?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE name=VALUES(name), display_name=VALUES(display_name), country=VALUES(country), last_active_at=NOW()`,
		userID, body.Name, body.DisplayName, body.Country,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to register user"})
	}

	return c.JSON(fiber.Map{"status": "OK"})
}
