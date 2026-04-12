package users

import (
	"ffinternal-go/service"
	"strconv"

	"github.com/gofiber/fiber/v2"
)

type RemoveItemsRequestBody struct {
	ItemCounts map[string]int `json:"item_counts"`
}

func RemoveItems(c *fiber.Ctx) error {
	userID := c.Params("userId")
	if userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user ID"})
	}

	var body RemoveItemsRequestBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if len(body.ItemCounts) == 0 {
		return c.JSON(fiber.Map{"status": "OK", "removed": 0})
	}

	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to the database"})
	}
	defer conn.Close()

	tx, err := conn.BeginTx(c.Context(), nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to begin transaction"})
	}
	defer tx.Rollback()

	totalRemoved := 0
	for itemID, count := range body.ItemCounts {
		if count <= 0 {
			continue
		}

		itemIDInt, err := strconv.Atoi(itemID)
		if err != nil {
			continue
		}

		result, err := tx.ExecContext(c.Context(),
			"DELETE FROM item_copies WHERE owner_id = ? AND item_id = ? LIMIT ?",
			userID, itemIDInt, count,
		)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to remove items"})
		}

		affected, _ := result.RowsAffected()
		totalRemoved += int(affected)
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit transaction"})
	}

	return c.JSON(fiber.Map{
		"status":  "OK",
		"removed": totalRemoved,
	})
}
