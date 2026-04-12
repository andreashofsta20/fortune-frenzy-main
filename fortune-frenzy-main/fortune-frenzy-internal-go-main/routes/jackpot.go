package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupJackpotRoutes(app *fiber.App) {
	jp := app.Group("/jackpot")

	jp.Get("/pots",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetPots,
	)

	jp.Post("/create",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.CreatePot,
	)

	jp.Post("/join/:jackpotId",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.JoinPot,
	)

	jp.Post("/leave/:jackpotId",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.LeavePot,
	)
}
