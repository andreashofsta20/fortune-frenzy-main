package handlers

import (
	"ffinternal-go/handlers/marketplace"

	"github.com/gofiber/fiber/v2"
)

func GetAllItems(c *fiber.Ctx) error {
	return marketplace.GetAllItems(c)
}

func GetItemByID(c *fiber.Ctx) error {
	return marketplace.GetItemByID(c)
}

func GetListings(c *fiber.Ctx) error {
	return marketplace.GetListings(c)
}

func GetOwners(c *fiber.Ctx) error {
	return marketplace.GetOwners(c)
}

func ListItem(c *fiber.Ctx) error {
	return marketplace.ListItem(c)
}

func PurchaseItem(c *fiber.Ctx) error {
	return marketplace.PurchaseItem(c)
}
