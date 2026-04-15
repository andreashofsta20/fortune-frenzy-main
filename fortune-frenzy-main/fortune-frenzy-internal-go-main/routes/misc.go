package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupMiscRoutes(app *fiber.App) {
	auth := middleware.Authorization(middleware.AuthTypeServerKey)
	masterAuth := middleware.Authorization(middleware.AuthTypeMasterKey)
	rlR := middleware.RateLimitRead()
	rlW := middleware.RateLimitWrite()

	app.Get("/leaderboard", rlR, auth, handlers.GetLeaderboard)

	app.Get("/statistics/minigames", rlR, auth, handlers.GetMinigameStats)
	app.Post("/statistics/minigames/ccu", rlW, auth, handlers.ReportMinigameCcu)

	app.Post("/logging/network", rlW, auth, handlers.NetworkLog)

	app.Post("/logging/discord", rlW, auth, handlers.DiscordRelay)

	// DB integrity: remove duplicate item_copies rows (same copy_id). Uses MASTER_KEY from env.
	app.Post("/maintenance/dedupe-item-copies", masterAuth, handlers.DedupeItemCopies)
}
