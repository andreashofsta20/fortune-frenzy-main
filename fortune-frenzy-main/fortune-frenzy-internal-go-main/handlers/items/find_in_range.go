package items

import (
	"crypto/rand"
	"ffinternal-go/service"
	"math/big"
	"strconv"

	"github.com/gofiber/fiber/v2"
)

func FindItemsInRange(c *fiber.Ctx) error {
	minValueStr := c.Query("min_value", c.Query("minValue"))
	maxValueStr := c.Query("max_value", c.Query("maxValue"))
	minItemsStr := c.Query("min_items", c.Query("minItems"))
	maxItemsStr := c.Query("max_items", c.Query("maxItems"))

	if minValueStr == "" || maxValueStr == "" || minItemsStr == "" || maxItemsStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "min_value, max_value, min_items, and max_items are required"})
	}

	minValue, err := strconv.ParseInt(minValueStr, 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid min_value"})
	}
	maxValue, err := strconv.ParseInt(maxValueStr, 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid max_value"})
	}
	minItems, err := strconv.Atoi(minItemsStr)
	if err != nil || minItems < 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid min_items"})
	}
	maxItems, err := strconv.Atoi(maxItemsStr)
	if err != nil || maxItems < minItems {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid max_items"})
	}

	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	rows, err := db.QueryContext(c.Context(),
		"SELECT id FROM items WHERE value BETWEEN ? AND ?",
		minValue, maxValue,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to query items"})
	}
	defer rows.Close()

	var allItems []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		allItems = append(allItems, id)
	}

	if len(allItems) == 0 {
		return c.JSON(fiber.Map{
			"success": true,
			"picks":   map[string]int{},
		})
	}

	count := minItems
	if maxItems > minItems {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(maxItems-minItems+1)))
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate random count"})
		}
		count = minItems + int(n.Int64())
	}

	if count > len(allItems) {
		count = len(allItems)
	}

	// Fisher-Yates shuffle then take first `count`
	shuffled := make([]string, len(allItems))
	copy(shuffled, allItems)
	for i := len(shuffled) - 1; i > 0; i-- {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to shuffle items"})
		}
		j := int(n.Int64())
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	}

	selected := shuffled[:count]
	picks := make(map[string]int)
	for _, id := range selected {
		picks[id]++
	}

	return c.JSON(fiber.Map{
		"success": true,
		"picks":   picks,
	})
}
