package handlers

import (
	"ffinternal-go/handlers/settings"

	"github.com/gofiber/fiber/v2"
)

func GetSettings(c *fiber.Ctx) error {
	return settings.GetSettings(c)
}
