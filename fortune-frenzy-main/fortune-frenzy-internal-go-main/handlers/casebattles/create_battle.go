package casebattles

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"ffinternal-go/service"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type BattlePlayer struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Position    int    `json:"position"`
	Bot         bool   `json:"bot"`
	ClientSeed  string `json:"client_seed"`
}

type PullItem struct {
	ID        int     `json:"id"`
	CaseIndex int     `json:"case_index"`
	Roll      string  `json:"roll"`
	Hash      string  `json:"hash"`
	Value     float64 `json:"value"`
}

type PlayerPull struct {
	Items      []PullItem `json:"items"`
	TotalValue float64    `json:"total_value"`
}

type SpinData struct {
	CurrentCaseIndex int    `json:"current_case_index"`
	CaseID           string `json:"case_id"`
	Progress         string `json:"progress"`
}

type WinnerInfo struct {
	PlayerID  string  `json:"player_id"`
	AmountWon float64 `json:"amount_won"`
}

type CaseBattleData struct {
	ID          string                `json:"id"`
	ServerID    string                `json:"server_id"`
	ServerSeed  string                `json:"server_seed"`
	TeamMode    string                `json:"team_mode"`
	Crazy       bool                  `json:"crazy"`
	Mode        string                `json:"mode"`
	FastMode    bool                  `json:"fast_mode"`
	Players     []BattlePlayer        `json:"players"`
	Cases       []string              `json:"cases"`
	PlayerPulls map[string]PlayerPull `json:"player_pulls"`
	SpinData    SpinData              `json:"current_spin_data"`
	// ResolvedPulls / ResolvedWinners mirror local-backend persistence; omitted once the battle completes.
	ResolvedPulls   map[string]PlayerPull `json:"resolved_pulls,omitempty"`
	ResolvedWinners []WinnerInfo          `json:"resolved_winners,omitempty"`
	WinnersInfo     []WinnerInfo          `json:"winners_info,omitempty"`
	Status          string                `json:"status"`
	NextStepAt      *int64                `json:"next_step_at,omitempty"`
	CreatedAt       int64                 `json:"created_at"`
	StartedAt       int64                 `json:"started_at"`
	CompletedAt     int64                 `json:"completed_at"`
	UpdatedAt       int64                 `json:"updated_at"`
}

type CreateBattleRequest struct {
	UserID     interface{} `json:"user_id"`
	ClientSeed string      `json:"client_seed"`
	Cases      []string    `json:"cases"`
	Mode       string      `json:"mode"`
	TeamMode   string      `json:"team_mode"`
	FastMode   bool        `json:"fast_mode"`
	Crazy      bool        `json:"crazy"`
	ServerID   string      `json:"server_id"`
}

func parseUserID(v interface{}) string {
	switch val := v.(type) {
	case float64:
		return strconv.FormatInt(int64(val), 10)
	case string:
		return val
	default:
		return fmt.Sprintf("%v", v)
	}
}

var validModes = map[string]bool{
	"Standard":   true,
	"Randomized": true,
	"Showdown":   true,
	"Group":      true,
}

var validTeamModes = map[string]bool{
	"1v1":     true,
	"1v1v1":   true,
	"1v1v1v1": true,
	"2v2":     true,
}

func teamModePlayerCount(teamMode string) int {
	switch teamMode {
	case "1v1":
		return 2
	case "1v1v1":
		return 3
	case "1v1v1v1":
		return 4
	case "2v2":
		return 4
	default:
		return 2
	}
}

func generateServerSeed() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	hash := sha256.Sum256(b)
	return hex.EncodeToString(hash[:]), nil
}

func secureRandInt(max int64) (int64, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(max))
	if err != nil {
		return 0, err
	}
	return n.Int64(), nil
}

// rollTicket picks an item using the same ticket space as local-backend pickCaseBattleItem:
// math.random(1, 100000) → inclusive 1..100000 (we use secureRandInt(100000)+1).
// DB/local seeds use min_ticket/max_ticket bands up to 99999 (and 100000 can fall through to fallback like Luau).
// Previously this used 0..9999 only, so almost every band was missed and the last item (often ~1% rare) always won.
func rollTicket(items []CaseBattleItem) (CaseBattleItem, int64, error) {
	n, err := secureRandInt(100000)
	if err != nil {
		return CaseBattleItem{}, 0, err
	}
	// Luau: math.random(1, 100000) — inclusive 1..100000
	ticket := n + 1
	for _, item := range items {
		if ticket >= int64(item.MinTicket) && ticket <= int64(item.MaxTicket) {
			return item, ticket, nil
		}
	}
	if len(items) > 0 {
		return items[len(items)-1], ticket, nil
	}
	return CaseBattleItem{}, ticket, fmt.Errorf("no items in case")
}

func computePlayerPulls(playerID, clientSeed, serverSeed string, cases []string, caseDataMap map[string]CaseBattleCase) (PlayerPull, error) {
	pull := PlayerPull{
		Items:      make([]PullItem, 0, len(cases)),
		TotalValue: 0,
	}

	for caseIndex, caseID := range cases {
		caseData, ok := caseDataMap[caseID]
		if !ok || len(caseData.Items) == 0 {
			continue
		}

		item, ticket, err := rollTicket(caseData.Items)
		if err != nil {
			return pull, err
		}

		rollStr := strconv.FormatInt(ticket, 10)
		hashInput := fmt.Sprintf("%s:%s:%s:%d:%s", serverSeed, clientSeed, playerID, caseIndex, rollStr)
		hashBytes := sha256.Sum256([]byte(hashInput))
		hash := hex.EncodeToString(hashBytes[:])

		pull.Items = append(pull.Items, PullItem{
			ID:        item.ID,
			CaseIndex: caseIndex,
			Roll:      rollStr,
			Hash:      hash,
			Value:     item.Value,
		})
		pull.TotalValue += item.Value
	}

	return pull, nil
}

// fetchCaseDataMapForIDs loads only the rows needed for a battle (avoids full-table scans on join/start).
func fetchCaseDataMapForIDs(ctx context.Context, caseIDs []string) (map[string]CaseBattleCase, error) {
	seen := make(map[string]struct{})
	var uniq []string
	for _, id := range caseIDs {
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		uniq = append(uniq, id)
	}
	if len(uniq) == 0 {
		return map[string]CaseBattleCase{}, nil
	}

	conn, err := service.GetMariaDBConnection()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	placeholders := make([]string, len(uniq))
	args := make([]interface{}, len(uniq))
	for i, id := range uniq {
		placeholders[i] = "?"
		args[i] = id
	}
	q := "SELECT id, name, slug, image, price, total_opened, created_at, items FROM case_battle_cases WHERE id IN (" + strings.Join(placeholders, ",") + ")"
	rows, err := conn.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]CaseBattleCase)
	for rows.Next() {
		var cs CaseBattleCase
		var itemsRaw []byte
		if err := rows.Scan(&cs.ID, &cs.Name, &cs.Slug, &cs.Image, &cs.Price, &cs.TotalOpened, &cs.CreatedAt, &itemsRaw); err != nil {
			continue
		}
		if err := json.Unmarshal(itemsRaw, &cs.Items); err != nil {
			cs.Items = []CaseBattleItem{}
		}
		result[cs.ID] = cs
	}
	return result, rows.Err()
}

func CreateBattle(c *fiber.Ctx) error {
	var body CreateBattleRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	userIDStr := parseUserID(body.UserID)
	if userIDStr == "" || userIDStr == "0" || len(body.Cases) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing required fields"})
	}
	if !validModes[body.Mode] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid mode"})
	}
	if !validTeamModes[body.TeamMode] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid team_mode"})
	}

	caseDataMap, err := fetchCaseDataMapForIDs(c.Context(), body.Cases)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to load case data"})
	}
	for _, caseID := range body.Cases {
		if _, ok := caseDataMap[caseID]; !ok {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid case ID: " + caseID})
		}
	}

	db, err := service.GetMariaDBConnection()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to connect to the database"})
	}
	defer db.Close()

	var username, displayName string
	err = db.QueryRowContext(c.Context(),
		"SELECT name, display_name FROM users WHERE user_id = ?", userIDStr,
	).Scan(&username, &displayName)
	if err != nil {
		username = "Player"
		displayName = "Player"
	}

	battleID := uuid.New().String()
	serverSeed, err := generateServerSeed()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate server seed"})
	}

	now := time.Now().UnixMilli()

	creator := BattlePlayer{
		ID:          userIDStr,
		Username:    username,
		DisplayName: displayName,
		Position:    1,
		Bot:         false,
		ClientSeed:  body.ClientSeed,
	}

	firstCaseID := ""
	if len(body.Cases) > 0 {
		firstCaseID = body.Cases[0]
	}

	battle := CaseBattleData{
		ID:         battleID,
		ServerID:   body.ServerID,
		ServerSeed: serverSeed,
		TeamMode:   body.TeamMode,
		Crazy:      body.Crazy,
		Mode:       body.Mode,
		FastMode:   body.FastMode,
		Players:    []BattlePlayer{creator},
		Cases:      body.Cases,
		PlayerPulls: map[string]PlayerPull{
			userIDStr: {Items: []PullItem{}, TotalValue: 0},
		},
		SpinData: SpinData{
			CurrentCaseIndex: 0,
			CaseID:           firstCaseID,
			Progress:         "0",
		},
		Status:      "waiting_for_players",
		CreatedAt:   now,
		StartedAt:   0,
		CompletedAt: 0,
		UpdatedAt:   now,
	}

	data, err := json.Marshal(battle)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to serialize battle"})
	}

	redis := service.GetRedisConnection()
	if err := redis.Set(c.Context(), "casebattle:"+battleID, string(data), 2*time.Hour).Err(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to store battle"})
	}

	return c.JSON(fiber.Map{
		"status": "OK",
		"data":   battle,
	})
}
