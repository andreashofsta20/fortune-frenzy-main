package misc

import (
	"ffinternal-go/utilities"
	"fmt"
	"log"

	"github.com/gofiber/fiber/v2"
)

type discordLogEntry struct {
	Level   string `json:"level"`
	Source  string `json:"source"`
	Message string `json:"message"`
	Route   string `json:"route,omitempty"`
	Code    int    `json:"code,omitempty"`
	Body    string `json:"body,omitempty"`
	Extra   string `json:"extra,omitempty"`
}

type discordRelayBody struct {
	ServerID string            `json:"server_id"`
	Entries  []discordLogEntry `json:"entries"`
}

func DiscordRelay(c *fiber.Ctx) error {
	var body discordRelayBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	log.Printf("[DiscordRelay] relaying %d Roblox log entries for server %s", len(body.Entries), body.ServerID)

	for _, entry := range body.Entries {
		details := map[string]string{
			"server": body.ServerID,
		}
		if entry.Route != "" {
			details["route"] = entry.Route
		}
		if entry.Code != 0 {
			details["code"] = fmt.Sprintf("%d", entry.Code)
		}
		if entry.Body != "" {
			details["body"] = entry.Body
		}
		if entry.Extra != "" {
			details["extra"] = entry.Extra
		}

		title := fmt.Sprintf("[Roblox/%s] %s", entry.Source, entry.Level)
		utilities.DiscordLogError(title, entry.Message, details)
	}

	return c.JSON(fiber.Map{"status": "OK"})
}
