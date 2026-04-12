package routes

import (
	"ffinternal-go/handlers"
	"ffinternal-go/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupUserRoutes(app *fiber.App) {
	auth := middleware.Authorization(middleware.AuthTypeServerKey)

	app.Get("/users/get-cash-changes", auth, handlers.GetCashChanges)
	app.Post("/users/update", auth, handlers.UpdateUsers)
	app.Get("/search/users", auth, handlers.SearchUsers)

	users := app.Group("/users")
	users.Post("/:userId", auth, handlers.RegisterUser)
	users.Post("/:userId/add-cash", auth, handlers.AddCash)
	users.Post("/:userId/remove-cash", auth, handlers.RemoveCash)
	users.Post("/:userId/remove-items", auth, handlers.RemoveItems)
	users.Post("/:userId/wipe-profile", auth, handlers.WipeProfile)
	users.Get("/:userId/inventory", auth, handlers.GetInventory)
	users.Get("/:userId/active", auth, handlers.GetUserActive)
	users.Get("/:userId", auth, handlers.GetUser)
}
