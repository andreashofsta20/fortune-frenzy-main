package cases

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"ffinternal-go/handlers/misc"
	"ffinternal-go/service"
	"math/big"
	"time"

	"github.com/gofiber/fiber/v2"
)

func OpenCase(c *fiber.Ctx) error {
	caseID := c.Params("caseId")
	if caseID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Case ID is required"})
	}

	var body OpenCaseRequestBody
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if body.UserID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "user_id is required"})
	}

	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	var _storedPrice int64
	var itemsJSON string
	var openedCount int64
	var _minValue, _maxValue int64
	var availableForGems bool
	var devProduct string
	var uiPrimary, uiColour string
	var nextRotation *time.Time
	var vipOnly bool

	err = db.QueryRowContext(c.Context(),
		"SELECT price, items, opened_count, min_value, max_value, available_for_gems, dev_product, ui_primary, ui_colour, next_rotation, vip_only FROM cases_catalog WHERE id = ?",
		caseID,
	).Scan(&_storedPrice, &itemsJSON, &openedCount, &_minValue, &_maxValue, &availableForGems, &devProduct, &uiPrimary, &uiColour, &nextRotation, &vipOnly)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Case not found"})
	}

	var caseItems []CaseItem
	if err := json.Unmarshal([]byte(itemsJSON), &caseItems); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to parse case items"})
	}

	if len(caseItems) == 0 {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Case has no items"})
	}

	if vipOnly && !body.VIPSubscribed {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "VIP subscription required for this case"})
	}

	computedPrice, minV, maxV, err := EnrichCaseItems(c.Context(), db, caseItems)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to resolve case pricing"})
	}

	winnerIdx, err := weightedRandomSelect(caseItems)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to select item"})
	}

	caseItems[winnerIdx].Claimed++
	openedCount++

	updatedItemsJSON, err := json.Marshal(caseItems)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to serialize updated items"})
	}

	_, err = db.ExecContext(c.Context(),
		"UPDATE cases_catalog SET items = ?, opened_count = opened_count + 1 WHERE id = ?",
		string(updatedItemsJSON), caseID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update case"})
	}

	wonItemID := caseItems[winnerIdx].ID
	uaid := generateUAID()
	copyID := generateUAID()

	var serial int
	if _, err = db.ExecContext(c.Context(),
		"INSERT INTO item_serials (item_id, next_serial) VALUES (?, 2) ON DUPLICATE KEY UPDATE next_serial = next_serial + 1",
		wonItemID,
	); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to allocate serial"})
	}
	if err = db.QueryRowContext(c.Context(),
		"SELECT next_serial - 1 FROM item_serials WHERE item_id = ?",
		wonItemID,
	).Scan(&serial); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read serial"})
	}

	_, err = db.ExecContext(c.Context(),
		"INSERT INTO item_copies (user_asset_id, item_id, owner_id, serial_number, copy_id) VALUES (?, ?, ?, ?, ?)",
		uaid, wonItemID, body.UserID, serial, copyID,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to grant item"})
	}

	misc.RecordItemCaseOpen(c.Context(), body.UserID)

	nextRotStr := nextRotationFallback(time.Now()).Format(time.RFC3339)
	if nextRotation != nil {
		nextRotStr = nextRotation.Format(time.RFC3339)
	}

	updatedCase := CaseData{
		ID:               caseID,
		Price:            computedPrice,
		Items:            caseItems,
		NextRotation:     nextRotStr,
		UIData:           CaseUIData{Primary: uiPrimary, Colour: uiColour},
		OpenedCount:      openedCount,
		MinValue:         minV,
		MaxValue:         maxV,
		AvailableForGems: availableForGems,
		DevProduct:       devProduct,
		VipOnly:          vipOnly,
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"result": fiber.Map{
			"id":      caseItems[winnerIdx].ID,
			"chance":  caseItems[winnerIdx].Chance,
			"claimed": caseItems[winnerIdx].Claimed,
		},
		"case": updatedCase,
	})
}

func generateUAID() string {
	b := make([]byte, 9)
	rand.Read(b)
	return "FF" + hex.EncodeToString(b)
}

func weightedRandomSelect(items []CaseItem) (int, error) {
	var totalChance float64
	for _, item := range items {
		totalChance += item.Chance
	}

	nBig, err := rand.Int(rand.Reader, big.NewInt(1<<53))
	if err != nil {
		return 0, err
	}
	roll := float64(nBig.Int64()) / float64(1<<53) * totalChance

	var cumulative float64
	for i, item := range items {
		cumulative += item.Chance
		if roll < cumulative {
			return i, nil
		}
	}

	return len(items) - 1, nil
}
