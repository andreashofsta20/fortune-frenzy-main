package handlers

import (
	"ffinternal-go/handlers/items"

	"github.com/gofiber/fiber/v2"
)

func AddItem(c *fiber.Ctx) error {
	return items.AddItem(c)
}

func FindItemsInRange(c *fiber.Ctx) error {
	return items.FindItemsInRange(c)
}

func TransferItems(c *fiber.Ctx) error {
	return items.TransferItems(c)
}

func ConfirmTransfer(c *fiber.Ctx) error {
	return items.ConfirmTransfer(c)
}
