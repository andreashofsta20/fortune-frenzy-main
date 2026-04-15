package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupTradingRoutes(app *fiber.App) {
	auth := middleware.Authorization(middleware.AuthTypeServerKey)
	rlR := middleware.RateLimitRead()
	rlW := middleware.RateLimitWrite()

	trades := app.Group("/trades")

	trades.Get("/:userIds", rlR, auth, handlers.GetTrades)

	trades.Post("/create", rlW, auth, handlers.CreateTrade)

	trades.Post("/:tradeId/accept", rlW, auth, handlers.AcceptTrade)

	trades.Post("/:tradeId/cancel", rlW, auth, handlers.CancelTrade)
}
