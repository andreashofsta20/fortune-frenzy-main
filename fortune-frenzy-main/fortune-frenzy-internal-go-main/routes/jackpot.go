package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupJackpotRoutes(app *fiber.App) {
	auth := middleware.Authorization(middleware.AuthTypeServerKey)
	rlR := middleware.RateLimitRead()
	rlW := middleware.RateLimitWrite()

	jp := app.Group("/jackpot")

	jp.Get("/pots", rlR, auth, handlers.GetPots)

	jp.Post("/create", rlW, auth, handlers.CreatePot)

	jp.Post("/join/:jackpotId", rlW, auth, handlers.JoinPot)

	jp.Post("/leave/:jackpotId", rlW, auth, handlers.LeavePot)
}
