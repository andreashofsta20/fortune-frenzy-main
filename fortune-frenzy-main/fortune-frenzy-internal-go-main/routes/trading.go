package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupTradingRoutes(app *fiber.App) {
	trades := app.Group("/trades")

	trades.Get("/:userIds",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetTrades,
	)

	trades.Post("/create",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.CreateTrade,
	)

	trades.Post("/:tradeId/accept",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.AcceptTrade,
	)

	trades.Post("/:tradeId/cancel",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.CancelTrade,
	)
}
