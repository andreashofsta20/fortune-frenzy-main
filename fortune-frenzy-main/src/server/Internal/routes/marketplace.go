package routes

import (
	"ffinternal-go/handlers"
	// "ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupMarketplaceRoutes(app *fiber.App) {
	marketplace := app.Group("/marketplace")

	marketplace.Get("/items",
		// middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetAllItems,
	)

	marketplace.Get("/items/:id",
		// middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetItemByID,
	)

	marketplace.Get("/listings",
		// middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetListings,
	)

	marketplace.Get("/listings/:id",
		// middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetListings,
	)

	marketplace.Get("/owners/:id",
		// middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.GetOwners,
	)

	marketplace.Post("/listings/:uaid",
		// middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.ListItem,
	)

	marketplace.Post("/copies/:uaid/buy",
		// middleware.Authorization(middleware.AuthTypeServerKey),
		handlers.PurchaseItem,
	)
}
