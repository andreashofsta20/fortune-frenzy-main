package handlers

import (
	"ffinternal-go/handlers/casebattles"

	"github.com/gofiber/fiber/v2"
)

func GetCaseBattleCases(c *fiber.Ctx) error {
	return casebattles.GetCaseBattleCases(c)
}

func GetBattles(c *fiber.Ctx) error {
	return casebattles.GetBattles(c)
}

func CreateBattle(c *fiber.Ctx) error {
	return casebattles.CreateBattle(c)
}

func JoinBattle(c *fiber.Ctx) error {
	return casebattles.JoinBattle(c)
}

func CancelBattle(c *fiber.Ctx) error {
	return casebattles.CancelBattle(c)
}
