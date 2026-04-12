package users

import (
	"ffinternal-go/service"
	"strconv"

	"github.com/gofiber/fiber/v2"
)

func SearchUsers(c *fiber.Ctx) error {
	keywords := c.Query("keywords")

	limitStr := c.Query("limit", "20")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	sort := c.Query("sort", "name_a-z")
	var orderClause string
	switch sort {
	case "value_high":
		orderClause = "current_value DESC"
	case "value_low":
		orderClause = "current_value ASC"
	case "name_a-z":
		orderClause = "name ASC"
	case "name_z-a":
		orderClause = "name DESC"
	default:
		orderClause = "name ASC"
	}

	if keywords == "" {
		return c.JSON(fiber.Map{
			"status":  "OK",
			"results": []fiber.Map{},
		})
	}

	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to the database"})
	}
	defer conn.Close()

	pattern := "%" + keywords + "%"
	rows, err := conn.QueryContext(c.Context(),
		"SELECT user_id, name, display_name, current_cash, current_value FROM users WHERE name LIKE ? OR display_name LIKE ? ORDER BY "+orderClause+" LIMIT ?",
		pattern, pattern, limit,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to search users"})
	}
	defer rows.Close()

	results := make([]fiber.Map, 0)
	for rows.Next() {
		var id, name, displayName string
		var currentCash, currentValue float64
		if err := rows.Scan(&id, &name, &displayName, &currentCash, &currentValue); err != nil {
			continue
		}
		results = append(results, fiber.Map{
			"id":            id,
			"name":          name,
			"display_name":  displayName,
			"current_cash":  currentCash,
			"current_value": currentValue,
		})
	}
	if err = rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read search results"})
	}

	return c.JSON(fiber.Map{
		"status":  "OK",
		"results": results,
	})
}
