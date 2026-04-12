package handlers

import (
	"ffinternal-go/handlers/users"

	"github.com/gofiber/fiber/v2"
)

func RegisterUser(c *fiber.Ctx) error    { return users.RegisterUser(c) }
func GetUser(c *fiber.Ctx) error         { return users.GetUser(c) }
func GetInventory(c *fiber.Ctx) error    { return users.GetInventory(c) }
func SearchUsers(c *fiber.Ctx) error     { return users.SearchUsers(c) }
func UpdateUsers(c *fiber.Ctx) error     { return users.UpdateUsers(c) }
func GetCashChanges(c *fiber.Ctx) error  { return users.GetCashChanges(c) }
func AddCash(c *fiber.Ctx) error         { return users.AddCash(c) }
func RemoveCash(c *fiber.Ctx) error      { return users.RemoveCash(c) }
func GetUserActive(c *fiber.Ctx) error   { return users.GetUserActive(c) }
func RemoveItems(c *fiber.Ctx) error     { return users.RemoveItems(c) }
func WipeProfile(c *fiber.Ctx) error     { return users.WipeProfile(c) }
