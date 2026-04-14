package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupCoinflipRoutes(app *fiber.App) {
	auth := middleware.Authorization(middleware.AuthTypeServerKey)

	// Roblox Packeter uses GET /coinflips?server_id=... (see CoinflipService.ts)
	app.Get("/coinflips", auth, handlers.GetCoinflips)

	coinflips := app.Group("/coinflip")

	// 🔹 Core CRUD
	coinflips.Get("/", auth, handlers.GetCoinflips)

	coinflips.Post("/create/:server_id", auth, handlers.CreateCoinflip)

	coinflips.Post("/join/:coinflip_id", auth, handlers.JoinCoinflip)

	coinflips.Post("/start/:coinflip_id", auth, handlers.StartCoinflip)

	coinflips.Post("/cancel/:coinflip_id", auth, handlers.CancelCoinflip)

	// 🔹 Bot / automation (Roblox uses /call-bot/; keep /bot/ as alias)
	coinflips.Post("/call-bot/:coinflip_id", auth, handlers.CallBot)
	coinflips.Post("/bot/:coinflip_id", auth, handlers.CallBot)

	// 🔹 Maintenance (Roblox uses hyphen, same as casebattles/cleanup-completed)
	cleanupCompleted := func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":  "ok",
			"removed": 0,
		})
	}
	coinflips.Post("/cleanup/completed", auth, cleanupCompleted)
	coinflips.Post("/cleanup-completed", auth, cleanupCompleted)
}