package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupMarketplaceRoutes(app *fiber.App) {
	auth := middleware.Authorization(middleware.AuthTypeServerKey)
	rlR := middleware.RateLimitRead()
	rlS := middleware.RateLimitStrict()

	marketplace := app.Group("/marketplace")

	marketplace.Get("/items", rlR, auth, handlers.GetAllItems)
	marketplace.Get("/items/all/listings", rlR, auth, handlers.GetListings)
	marketplace.Get("/items/:id/listings", rlR, auth, handlers.GetListings)
	marketplace.Get("/items/:id", rlR, auth, handlers.GetItemByID)

	marketplace.Get("/listings", rlR, auth, handlers.GetListings)
	marketplace.Get("/listings/:id", rlR, auth, handlers.GetListings)

	marketplace.Get("/owners/:id", rlR, auth, handlers.GetOwners)

	marketplace.Post("/listings/:uaid", rlS, auth, handlers.ListItem)
	marketplace.Post("/copies/:uaid/list", rlS, auth, handlers.ListItem)
	marketplace.Post("/copies/:uaid/buy", rlS, auth, handlers.PurchaseItem)
}
