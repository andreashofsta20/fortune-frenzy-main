package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupItemRoutes(app *fiber.App) {
	auth := middleware.Authorization(middleware.AuthTypeServerKey)
	rlR := middleware.RateLimitRead()
	rlS := middleware.RateLimitStrict()

	items := app.Group("/items")

	items.Post("/add", rlS, auth, handlers.AddItem)

	items.Get("/find_items_in_range", rlR, auth, handlers.FindItemsInRange)

	items.Post("/item-transfer", rlS, auth, handlers.TransferItems)

	items.Post("/item-transfer/:transferId/confirm", rlS, auth, handlers.ConfirmTransfer)
}
