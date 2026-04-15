package misc

import (
	"log"

	"github.com/gofiber/fiber/v2"
)

type networkLogEntry struct {
	NetworkName string `json:"network_name"`
	Speed       float64 `json:"speed"`
	Response    string  `json:"response"`
	Player      struct {
		Name string `json:"name"`
		ID   int    `json:"id"`
	} `json:"player"`
}

type networkLogBody struct {
	ServerID string           `json:"server_id"`
	Logs     []networkLogEntry `json:"logs"`
}

func NetworkLog(c *fiber.Ctx) error {
	var body networkLogBody
	if err := c.BodyParser(&body); err == nil && len(body.Logs) > 0 {
		for _, entry := range body.Logs {
			if entry.Speed > 5.0 {
				log.Printf("[SlowNetworkCall] server=%s network=%s speed=%.2fs player=%s (%d) response=%s",
					body.ServerID, entry.NetworkName, entry.Speed, entry.Player.Name, entry.Player.ID, entry.Response)
			}
		}
	}

	return c.JSON(fiber.Map{
		"status": "OK",
	})
}
