package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupUserRoutes(app *fiber.App) {
	auth := middleware.Authorization(middleware.AuthTypeServerKey)
	rlR := middleware.RateLimitRead()
	rlW := middleware.RateLimitWrite()
	rlS := middleware.RateLimitStrict()

	app.Get("/users/get-cash-changes", rlR, auth, handlers.GetCashChanges)
	app.Post("/users/update", rlW, auth, handlers.UpdateUsers)
	app.Get("/search/users", rlR, auth, handlers.SearchUsers)
	app.Get("/search/users/", rlR, auth, handlers.SearchUsers)

	users := app.Group("/users")
	users.Post("/:userId", rlW, auth, handlers.RegisterUser)
	users.Post("/:userId/add-cash", rlS, auth, handlers.AddCash)
	users.Post("/:userId/remove-cash", rlS, auth, handlers.RemoveCash)
	users.Post("/:userId/wallet/bootstrap", rlS, auth, handlers.BootstrapWallet)
	users.Get("/:userId/wallet", rlR, auth, handlers.GetWallet)
	users.Post("/:userId/wallet/adjust", rlS, auth, handlers.AdjustWallet)
	users.Post("/:userId/remove-items", rlS, auth, handlers.RemoveItems)
	users.Post("/:userId/wipe-profile", rlS, auth, handlers.WipeProfile)
	users.Get("/:userId/inventory", rlR, auth, handlers.GetInventory)
	users.Get("/:userId/active", rlR, auth, handlers.GetUserActive)
	users.Get("/:userId", rlR, auth, handlers.GetUser)
}
