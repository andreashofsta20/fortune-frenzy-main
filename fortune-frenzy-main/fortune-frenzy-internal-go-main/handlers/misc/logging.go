package misc

import (
	"ffinternal-go/utilities"
	"fmt"

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
				utilities.DiscordLogError("SlowNetworkCall", fmt.Sprintf("%s took %.2fs for player %s (%d)", entry.NetworkName, entry.Speed, entry.Player.Name, entry.Player.ID), map[string]string{
					"server":   body.ServerID,
					"response": entry.Response,
				})
			}
		}
	}

	return c.JSON(fiber.Map{
		"status": "OK",
	})
}
