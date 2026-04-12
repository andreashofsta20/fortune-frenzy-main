package users

import (
	"ffinternal-go/service"
	"fmt"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

type CashChange struct {
	UserID string `json:"user_id"`
	Amount string `json:"amount"`
}

func normalizeAmountField(v any) (int64, error) {
	switch x := v.(type) {
	case float64:
		return int64(x), nil
	case string:
		return strconv.ParseInt(strings.TrimSpace(x), 10, 64)
	case int:
		return int64(x), nil
	case int64:
		return x, nil
	default:
		return 0, fmt.Errorf("invalid amount type")
	}
}

func parseAmountFromBody(c *fiber.Ctx) (int64, error) {
	var m map[string]any
	if err := c.BodyParser(&m); err != nil {
		return 0, err
	}
	raw, ok := m["amount"]
	if !ok || raw == nil {
		return 0, fmt.Errorf("missing amount")
	}
	return normalizeAmountField(raw)
}

func insertCashChange(c *fiber.Ctx, userID string, delta int64) error {
	if delta == 0 {
		return fmt.Errorf("zero amount")
	}
	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return err
	}
	defer conn.Close()
	_, err = conn.ExecContext(c.Context(),
		"INSERT INTO cash_changes (user_id, amount, consumed) VALUES (?, ?, false)",
		userID, delta,
	)
	return err
}

func GetCashChanges(c *fiber.Ctx) error {
	userIDsHeader := c.Get("user-ids")
	if userIDsHeader == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user-ids header"})
	}

	userIDs := strings.Split(userIDsHeader, ",")
	if len(userIDs) == 0 {
		return c.JSON(fiber.Map{"status": "OK", "changes": []any{}})
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

	placeholders := strings.Repeat("?,", len(userIDs))
	placeholders = placeholders[:len(placeholders)-1]

	args := make([]any, len(userIDs))
	for i, id := range userIDs {
		args[i] = strings.TrimSpace(id)
	}

	rows, err := tx.QueryContext(c.Context(),
		"SELECT id, user_id, amount FROM cash_changes WHERE user_id IN ("+placeholders+") AND consumed = false",
		args...,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to query cash changes"})
	}

	var changeIDs []any
	changes := make([]CashChange, 0)
	for rows.Next() {
		var id int64
		var userID string
		var amount int64
		if err := rows.Scan(&id, &userID, &amount); err != nil {
			rows.Close()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to scan cash change"})
		}
		changeIDs = append(changeIDs, id)
		changes = append(changes, CashChange{UserID: userID, Amount: fmt.Sprintf("%d", amount)})
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read cash changes"})
	}

	if len(changeIDs) > 0 {
		updatePlaceholders := strings.Repeat("?,", len(changeIDs))
		updatePlaceholders = updatePlaceholders[:len(updatePlaceholders)-1]
		_, err = tx.ExecContext(c.Context(),
			"UPDATE cash_changes SET consumed = true WHERE id IN ("+updatePlaceholders+")",
			changeIDs...,
		)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to mark changes consumed"})
		}
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to commit transaction"})
	}

	return c.JSON(fiber.Map{
		"status":  "OK",
		"changes": changes,
	})
}

func AddCash(c *fiber.Ctx) error {
	userID := c.Params("userId")
	if userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user ID"})
	}

	amt, err := parseAmountFromBody(c)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if amt <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Amount must be positive"})
	}

	if err := insertCashChange(c, userID, amt); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to add cash change"})
	}

	return c.JSON(fiber.Map{"status": "OK"})
}

func RemoveCash(c *fiber.Ctx) error {
	userID := c.Params("userId")
	if userID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing user ID"})
	}

	amt, err := parseAmountFromBody(c)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if amt <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Amount must be positive"})
	}

	if err := insertCashChange(c, userID, -amt); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to remove cash change"})
	}

	return c.JSON(fiber.Map{"status": "OK"})
}
