package cases

import (
	"encoding/json"
	"ffinternal-go/service"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
)

func GetCases(c *fiber.Ctx) error {
	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	rows, err := db.QueryContext(c.Context(),
		"SELECT id, price, items, next_rotation, ui_primary, ui_colour, opened_count, min_value, max_value, available_for_gems, dev_product, vip_only FROM cases_catalog",
	)
	if err != nil {
		log.Printf("[GetCases] query cases_catalog: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to query cases"})
	}

	// Read the full result set before calling EnrichCaseItems (which runs more queries on the same
	// *sql.Conn). MySQL does not allow an interleaved second query while this Rows is open; the
	// driver would block forever (see /casebattles/cases which only runs one statement per conn).
	cases := make([]CaseData, 0)
	for rows.Next() {
		var cd CaseData
		var itemsJSON string
		var nextRotation *time.Time
		var uiPrimary, uiColour string
		var _storedPrice int64

		err := rows.Scan(
			&cd.ID, &_storedPrice, &itemsJSON, &nextRotation,
			&uiPrimary, &uiColour, &cd.OpenedCount,
			&cd.MinValue, &cd.MaxValue, &cd.AvailableForGems, &cd.DevProduct, &cd.VipOnly,
		)
		if err != nil {
			continue
		}

		if err := json.Unmarshal([]byte(itemsJSON), &cd.Items); err != nil {
			cd.Items = []CaseItem{}
		}

		if nextRotation != nil {
			cd.NextRotation = nextRotation.Format(time.RFC3339)
		} else {
			cd.NextRotation = nextRotationFallback(time.Now()).Format(time.RFC3339)
		}
		cd.UIData = CaseUIData{Primary: uiPrimary, Colour: uiColour}
		cases = append(cases, cd)
	}
	if err = rows.Err(); err != nil {
		_ = rows.Close()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read cases"})
	}
	if err := rows.Close(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read cases"})
	}

	for i := range cases {
		cd := &cases[i]
		if len(cd.Items) == 0 {
			continue
		}
		p, mn, mx, perr := EnrichCaseItems(c.Context(), db, cd.Items)
		if perr != nil {
			log.Printf("[GetCases] enrich case %s: %v", cd.ID, perr)
		} else {
			cd.Price = p
			cd.MinValue = mn
			cd.MaxValue = mx
		}
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"data":   cases,
	})
}
