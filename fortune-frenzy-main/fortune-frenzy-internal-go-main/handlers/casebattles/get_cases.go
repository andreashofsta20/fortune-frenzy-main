package casebattles

import (
	"encoding/json"
	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
)

type CaseBattleItem struct {
	ID        int     `json:"id"`
	CaseID    string  `json:"case_id"`
	AssetID   string  `json:"asset_id"`
	AssetType string  `json:"asset_type"`
	Name      string  `json:"name"`
	Value     float64 `json:"value"`
	Image     string  `json:"image"`
	MinTicket int     `json:"min_ticket"`
	MaxTicket int     `json:"max_ticket"`
}

type CaseBattleCase struct {
	ID          string           `json:"id"`
	Name        string           `json:"name"`
	Slug        string           `json:"slug"`
	Image       string           `json:"image"`
	Price       float64          `json:"price"`
	TotalOpened int              `json:"total_opened"`
	CreatedAt   string           `json:"created_at"`
	Items       []CaseBattleItem `json:"items"`
}

func GetCaseBattleCases(c *fiber.Ctx) error {
	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to the database"})
	}
	defer conn.Close()

	rows, err := conn.QueryContext(c.Context(),
		"SELECT id, name, slug, image, price, total_opened, created_at, items FROM case_battle_cases")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to query case battle cases"})
	}
	defer rows.Close()

	cases := make([]CaseBattleCase, 0)
	for rows.Next() {
		var cs CaseBattleCase
		var itemsRaw []byte
		if err := rows.Scan(&cs.ID, &cs.Name, &cs.Slug, &cs.Image, &cs.Price, &cs.TotalOpened, &cs.CreatedAt, &itemsRaw); err != nil {
			continue
		}
		if err := json.Unmarshal(itemsRaw, &cs.Items); err != nil {
			cs.Items = []CaseBattleItem{}
		}
		cases = append(cases, cs)
	}
	if err = rows.Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read case battle cases"})
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"data":   cases,
	})
}
