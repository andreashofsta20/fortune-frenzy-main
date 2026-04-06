package handlers

import (
	"ffinternal-go/handlers/coinflip"

	"github.com/gofiber/fiber/v2"
)

func CreateCoinflip(c *fiber.Ctx) error {
	return coinflip.CreateCoinflip(c)
}

func CancelCoinflip(c *fiber.Ctx) error {
	return coinflip.CancelCoinflip(c)
}

func GetCoinflips(c *fiber.Ctx) error {
	return coinflip.GetCoinflips(c)
}

func StartCoinflip(c *fiber.Ctx) error {
	return coinflip.StartCoinflip(c)
}
