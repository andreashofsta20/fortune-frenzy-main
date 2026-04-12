package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupCaseBattleRoutes(app *fiber.App) {
	cb := app.Group("/casebattles")

	cb.Get("/cases",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetCaseBattleCases,
	)

	cb.Get("/",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetBattles,
	)

	cb.Post("/create",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.CreateBattle,
	)

	cb.Post("/join/:battleId",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.JoinBattle,
	)

	cb.Post("/cancel/:battleId",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.CancelBattle,
	)

	cb.Post("/cleanup-completed",
		middleware.Authorization(middleware.AuthTypeServerKey),
		func(c *fiber.Ctx) error {
			return c.JSON(fiber.Map{"status": "OK", "removed": 0})
		},
	)
}
