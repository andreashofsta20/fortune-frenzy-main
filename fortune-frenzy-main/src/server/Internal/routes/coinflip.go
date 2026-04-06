package routes

import (
	"ffinternal-go/handlers"
	// "ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupCoinflipRoutes(app *fiber.App) {
	coinflip := app.Group("/coinflip")

	coinflip.Post("/create/:server_id",
		// middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.CreateCoinflip,
	)

	coinflip.Post("/cancel/:coinflip_id",
		// middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.CancelCoinflip,
	)

	coinflip.Get("/",
		// middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetCoinflips,
	)

	coinflip.Post("/start/:coinflip_id",
		// middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.StartCoinflip,
	)
}
