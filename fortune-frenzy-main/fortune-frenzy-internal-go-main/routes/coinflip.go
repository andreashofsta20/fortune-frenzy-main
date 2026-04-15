package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupCoinflipRoutes(app *fiber.App) {
	auth := middleware.Authorization(middleware.AuthTypeServerKey)
	rlR := middleware.RateLimitRead()
	rlW := middleware.RateLimitWrite()

	app.Get("/coinflips", rlR, auth, handlers.GetCoinflips)

	coinflips := app.Group("/coinflip")

	coinflips.Get("/", rlR, auth, handlers.GetCoinflips)

	coinflips.Post("/create/:server_id", rlW, auth, handlers.CreateCoinflip)

	coinflips.Post("/join/:coinflip_id", rlW, auth, handlers.JoinCoinflip)

	coinflips.Post("/start/:coinflip_id", rlW, auth, handlers.StartCoinflip)

	coinflips.Post("/cancel/:coinflip_id", rlW, auth, handlers.CancelCoinflip)

	coinflips.Post("/call-bot/:coinflip_id", rlW, auth, handlers.CallBot)
	coinflips.Post("/bot/:coinflip_id", rlW, auth, handlers.CallBot)

	cleanupCompleted := func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":  "ok",
			"removed": 0,
		})
	}
	coinflips.Post("/cleanup/completed", rlW, auth, cleanupCompleted)
	coinflips.Post("/cleanup-completed", rlW, auth, cleanupCompleted)
}
