package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupSettingsRoutes(app *fiber.App) {
	app.Get("/settings",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetSettings,
	)
}
