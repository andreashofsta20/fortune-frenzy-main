package main

import (
	"ffinternal-go/middleware"
	"ffinternal-go/routes"
	"ffinternal-go/service"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/joho/godotenv"
)

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

	service.InitMariaDB()
	service.InitRedis()
	app := fiber.New()

	app.Use(middleware.RequestTimer())

	routes.SetupMarketplaceRoutes(app)
	routes.SetupCoinflipRoutes(app)

	log.Println("Server is running on port " + os.Getenv("PORT"))
	if err := app.Listen(":" + os.Getenv("PORT")); err != nil {
		log.Fatalf("Error starting server: %v", err)
	}
}
