package misc

import (
	"database/sql"
	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
)

// DedupeItemCopies removes duplicate item_copies rows that share the same non-empty copy_id,
// keeping the row with the lexicographically smallest user_asset_id (stable tie-break).
// Requires header: master-key (see middleware.AuthTypeMasterKey).
func DedupeItemCopies(c *fiber.Ctx) error {
	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer conn.Close()

	const q = `
DELETE ic FROM item_copies ic
INNER JOIN (
	SELECT copy_id, MIN(user_asset_id) AS keep_uaid
	FROM item_copies
	WHERE copy_id <> ''
	GROUP BY copy_id
	HAVING COUNT(*) > 1
) keeper ON ic.copy_id = keeper.copy_id
WHERE ic.copy_id <> '' AND ic.user_asset_id <> keeper.keep_uaid`

	var res sql.Result
	res, err = conn.ExecContext(c.Context(), q)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	n, _ := res.RowsAffected()
	return c.JSON(fiber.Map{
		"status":           "OK",
		"rows_deleted":     n,
		"message":          "Duplicate copy_id rows removed (one keeper per copy_id).",
	})
}
