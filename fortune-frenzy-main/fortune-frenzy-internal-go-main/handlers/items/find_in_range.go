package items

import (
	"crypto/rand"
	"ffinternal-go/service"
	"math"
	"math/big"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// parseRangeInt64 parses max_value; treats "inf" / huge floats stringified from Lua as int64 max.
func parseRangeInt64(s string) (int64, error) {
	s = strings.TrimSpace(strings.ToLower(s))
	if s == "inf" || s == "+inf" || s == "infinity" {
		return math.MaxInt64, nil
	}
	return strconv.ParseInt(strings.TrimSpace(s), 10, 64)
}

func FindItemsInRange(c *fiber.Ctx) error {
	minValueStr := c.Query("min_value", c.Query("minValue"))
	maxValueStr := c.Query("max_value", c.Query("maxValue"))
	minItemsStr := c.Query("min_items", c.Query("minItems"))
	maxItemsStr := c.Query("max_items", c.Query("maxItems"))
	ownerID := c.Query("user_id", c.Query("userId"))

	if minValueStr == "" || maxValueStr == "" || minItemsStr == "" || maxItemsStr == "" || ownerID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "min_value, max_value, min_items, max_items, and user_id are required"})
	}

	minValue, err := strconv.ParseInt(minValueStr, 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid min_value"})
	}
	maxValue, err := parseRangeInt64(maxValueStr)
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

	rows, err := db.QueryContext(c.Context(), `
SELECT ic.item_id, COUNT(*) AS cnt
FROM item_copies ic
JOIN items i ON i.id = ic.item_id
LEFT JOIN item_listings il ON il.user_asset_id = ic.user_asset_id
WHERE ic.owner_id = ? AND i.value >= ? AND i.value <= ? AND il.user_asset_id IS NULL
GROUP BY ic.item_id`, ownerID, minValue, maxValue)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to query items"})
	}
	defer rows.Close()

	var pool []string
	for rows.Next() {
		var itemID string
		var cnt int
		if err := rows.Scan(&itemID, &cnt); err != nil {
			continue
		}
		n := cnt
		if n > maxItems {
			n = maxItems
		}
		for i := 0; i < n; i++ {
			pool = append(pool, itemID)
		}
	}

	if len(pool) == 0 {
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
	if count > len(pool) {
		count = len(pool)
	}

	shuffled := make([]string, len(pool))
	copy(shuffled, pool)
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
