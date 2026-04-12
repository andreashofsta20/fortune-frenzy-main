package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupCaseRoutes(app *fiber.App) {
	casesGroup := app.Group("/cases")

	casesGroup.Get("/",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetCases,
	)

	casesGroup.Post("/open/:caseId",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.OpenCase,
	)
}
