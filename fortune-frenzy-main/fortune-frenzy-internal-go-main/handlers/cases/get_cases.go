package cases

import (
	"encoding/json"
	"ffinternal-go/service"
	"time"

	"github.com/gofiber/fiber/v2"
)

type CaseItem struct {
	ID      string  `json:"id"`
	Chance  float64 `json:"chance"`
	Claimed int64   `json:"claimed"`
}

type CaseUIData struct {
	Primary string `json:"primary"`
	Colour  string `json:"colour"`
}

type CaseData struct {
	ID               string     `json:"id"`
	Price            int64      `json:"price"`
	Items            []CaseItem `json:"items"`
	NextRotation     string     `json:"next_rotation"`
	UIData           CaseUIData `json:"ui_data"`
	OpenedCount      int64      `json:"opened_count"`
	MinValue         int64      `json:"min_value"`
	MaxValue         int64      `json:"max_value"`
	AvailableForGems bool       `json:"available_for_gems"`
	DevProduct       string     `json:"dev_product"`
}

func GetCases(c *fiber.Ctx) error {
	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to database"})
	}
	defer db.Close()

	rows, err := db.QueryContext(c.Context(),
		"SELECT id, price, items, next_rotation, ui_primary, ui_colour, opened_count, min_value, max_value, available_for_gems, dev_product FROM cases_catalog",
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to query cases"})
	}
	defer rows.Close()

	cases := make([]CaseData, 0)
	for rows.Next() {
		var cd CaseData
		var itemsJSON string
		var nextRotation *time.Time
		var uiPrimary, uiColour string

		err := rows.Scan(
			&cd.ID, &cd.Price, &itemsJSON, &nextRotation,
			&uiPrimary, &uiColour, &cd.OpenedCount,
			&cd.MinValue, &cd.MaxValue, &cd.AvailableForGems, &cd.DevProduct,
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
			now := time.Now()
			tomorrow := time.Date(now.Year(), now.Month(), now.Day()+1, 6, 0, 0, 0, time.UTC)
			cd.NextRotation = tomorrow.Format(time.RFC3339)
		}
		cd.UIData = CaseUIData{Primary: uiPrimary, Colour: uiColour}
		cases = append(cases, cd)
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"data":   cases,
	})
}
