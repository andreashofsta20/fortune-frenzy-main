package settings

import (
	"encoding/json"
	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
)

func GetSettings(c *fiber.Ctx) error {
	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to the database"})
	}
	defer conn.Close()

	rows, err := conn.QueryContext(c.Context(), "SELECT setting_key, setting_value FROM settings")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to query settings"})
	}
	defer rows.Close()

	result := make(fiber.Map)
	for rows.Next() {
		var key string
		var value json.RawMessage
		if err := rows.Scan(&key, &value); err != nil {
			continue
		}
		var parsed any
		if err := json.Unmarshal(value, &parsed); err != nil {
			result[key] = string(value)
		} else {
			result[key] = parsed
		}
	}
	if err = rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read settings"})
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"result": result,
	})
}
