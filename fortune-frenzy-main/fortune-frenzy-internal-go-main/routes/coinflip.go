package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupCoinflipRoutes(app *fiber.App) {
	coinflip := app.Group("/coinflip")

	coinflip.Post("/create/:server_id",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.CreateCoinflip,
	)

	coinflip.Post("/cancel/:coinflip_id",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.CancelCoinflip,
	)

	coinflip.Get("/",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetCoinflips,
	)

	coinflip.Post("/join/:coinflip_id",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.JoinCoinflip,
	)

	coinflip.Post("/start/:coinflip_id",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.StartCoinflip,
	)

	coinflip.Post("/call-bot/:coinflip_id",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.CallBot,
	)

	coinflip.Post("/cleanup-completed",
		middleware.Authorization(middleware.AuthTypeServerKey),
		func(c *fiber.Ctx) error {
			return c.JSON(fiber.Map{"status": "OK", "removed": 0})
		},
	)

	app.Get("/coinflips",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetCoinflips,
	)
}
