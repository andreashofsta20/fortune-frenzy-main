package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupMiscRoutes(app *fiber.App) {
	app.Get("/leaderboard",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetLeaderboard,
	)

	app.Get("/statistics/minigames",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetMinigameStats,
	)

	app.Post("/logging/network",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.NetworkLog,
	)

	app.Post("/logging/discord",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.DiscordRelay,
	)
}
