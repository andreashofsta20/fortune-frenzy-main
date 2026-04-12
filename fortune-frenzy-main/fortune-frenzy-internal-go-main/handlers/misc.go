package handlers

import (
	"ffinternal-go/handlers/misc"

	"github.com/gofiber/fiber/v2"
)

func GetLeaderboard(c *fiber.Ctx) error {
	return misc.GetLeaderboard(c)
}

func GetMinigameStats(c *fiber.Ctx) error {
	return misc.GetMinigameStats(c)
}

func NetworkLog(c *fiber.Ctx) error {
	return misc.NetworkLog(c)
}

func DiscordRelay(c *fiber.Ctx) error {
	return misc.DiscordRelay(c)
}
