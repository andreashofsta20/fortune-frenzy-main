package middleware

import (
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
)

// RequestTimer middleware measures the time taken to process each request
func RequestTimer() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Start timer
		start := time.Now()

		// Process request chain
		err := c.Next()

		// Calculate duration
		duration := time.Since(start)

		// Log the timing information
		log.Printf(
			"[%s] %s - %d - Execution Time: %v",
			c.Method(),
			c.Path(),
			c.Response().StatusCode(),
			duration,
		)

		return err
	}
}
