package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupCaseBattleRoutes(app *fiber.App) {
	auth := middleware.Authorization(middleware.AuthTypeServerKey)
	rlR := middleware.RateLimitRead()
	rlW := middleware.RateLimitWrite()

	cb := app.Group("/casebattles")

	cb.Get("/cases", rlR, auth, handlers.GetCaseBattleCases)

	cb.Get("/", rlR, auth, handlers.GetBattles)

	cb.Post("/create", rlW, auth, handlers.CreateBattle)

	cb.Post("/join/:battleId", rlW, auth, handlers.JoinBattle)

	cb.Post("/cancel/:battleId", rlW, auth, handlers.CancelBattle)

	cb.Post("/cleanup-completed", rlW, auth, func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "OK", "removed": 0})
	})
}
