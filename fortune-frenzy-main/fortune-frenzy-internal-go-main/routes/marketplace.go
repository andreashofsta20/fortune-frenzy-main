package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupMarketplaceRoutes(app *fiber.App) {
	auth := middleware.Authorization(middleware.AuthTypeServerKey)
	marketplace := app.Group("/marketplace")

	marketplace.Get("/items", auth, handlers.GetAllItems)
	marketplace.Get("/items/all/listings", auth, handlers.GetListings)
	marketplace.Get("/items/:id/listings", auth, handlers.GetListings)
	marketplace.Get("/items/:id", auth, handlers.GetItemByID)

	marketplace.Get("/listings", auth, handlers.GetListings)
	marketplace.Get("/listings/:id", auth, handlers.GetListings)

	marketplace.Get("/owners/:id", auth, handlers.GetOwners)

	marketplace.Post("/listings/:uaid", auth, handlers.ListItem)
	marketplace.Post("/copies/:uaid/list", auth, handlers.ListItem)
	marketplace.Post("/copies/:uaid/buy", auth, handlers.PurchaseItem)
}
