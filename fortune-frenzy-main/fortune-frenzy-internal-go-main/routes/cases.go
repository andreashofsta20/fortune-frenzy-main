package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupCaseRoutes(app *fiber.App) {
	auth := middleware.Authorization(middleware.AuthTypeServerKey)
	rlR := middleware.RateLimitRead()
	rlS := middleware.RateLimitStrict()

	casesGroup := app.Group("/cases")

	casesGroup.Get("/", rlR, auth, handlers.GetCases)

	casesGroup.Post("/open/:caseId", rlS, auth, handlers.OpenCase)
}
