package users

import (
	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

func GetUserActive(c *fiber.Ctx) error {
	userID := c.Params("userId")
	if userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user ID"})
	}

	rdb := service.GetRedisConnection()
	_, err := rdb.Get(c.Context(), "active_user:"+userID).Result()

	active := true
	if err == redis.Nil {
		active = false
	} else if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to check active status"})
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"active": active,
	})
}
