package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupItemRoutes(app *fiber.App) {
	items := app.Group("/items")

	items.Post("/add",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.AddItem,
	)

	items.Get("/find_items_in_range",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.FindItemsInRange,
	)

	items.Post("/item-transfer",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.TransferItems,
	)

	items.Post("/item-transfer/:transferId/confirm",
		middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.ConfirmTransfer,
	)
}
