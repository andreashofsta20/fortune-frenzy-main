package handlers

import (
	"ffinternal-go/handlers/cases"

	"github.com/gofiber/fiber/v2"
)

func GetCases(c *fiber.Ctx) error {
	return cases.GetCases(c)
}

func OpenCase(c *fiber.Ctx) error {
	return cases.OpenCase(c)
}
