package handlers

import (
	"ffinternal-go/handlers/jackpot"

	"github.com/gofiber/fiber/v2"
)

func GetPots(c *fiber.Ctx) error {
	return jackpot.GetPots(c)
}

func CreatePot(c *fiber.Ctx) error {
	return jackpot.CreatePot(c)
}

func JoinPot(c *fiber.Ctx) error {
	return jackpot.JoinPot(c)
}

func LeavePot(c *fiber.Ctx) error {
	return jackpot.LeavePot(c)
}
