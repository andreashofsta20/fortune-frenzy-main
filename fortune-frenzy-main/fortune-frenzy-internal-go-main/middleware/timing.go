package middleware

import (
	"ffinternal-go/utilities"
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
)

func RequestTimer() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		duration := time.Since(start)
		status := c.Response().StatusCode()

		log.Printf("[%s] %s - %d - Execution Time: %v", c.Method(), c.Path(), status, duration)

		if status >= 500 {
			utilities.DiscordLogError("HTTP", fmt.Sprintf("%s %s returned %d", c.Method(), c.Path(), status), map[string]string{
				"duration": duration.String(),
			})
		}

		return err
	}
}
