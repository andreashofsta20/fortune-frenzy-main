package handlers

import (
	"ffinternal-go/handlers/trading"

	"github.com/gofiber/fiber/v2"
)

func GetTrades(c *fiber.Ctx) error {
	return trading.GetTrades(c)
}

func CreateTrade(c *fiber.Ctx) error {
	return trading.CreateTrade(c)
}

func AcceptTrade(c *fiber.Ctx) error {
	return trading.AcceptTrade(c)
}

func CancelTrade(c *fiber.Ctx) error {
	return trading.CancelTrade(c)
}
