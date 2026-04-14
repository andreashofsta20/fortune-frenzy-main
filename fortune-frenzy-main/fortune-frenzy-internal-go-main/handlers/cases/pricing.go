package cases

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"os"
	"strconv"
	"strings"
)

// caseOpenHouseEdgeMultiplier returns 1 + CASE_OPEN_HOUSE_EDGE_PERCENT/100 (default 5% → 1.05).
func caseOpenHouseEdgeMultiplier() float64 {
	s := strings.TrimSpace(os.Getenv("CASE_OPEN_HOUSE_EDGE_PERCENT"))
	if s == "" {
		return 1.05
	}
	pct, err := strconv.ParseFloat(s, 64)
	if err != nil || pct < 0 || pct > 100 {
		return 1.05
	}
	return 1 + pct/100
}

// caseRowsQuerier matches *sql.DB and *sql.Conn (service.GetMariaDBConnection).
type caseRowsQuerier interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

func fetchItemValuesByIDs(ctx context.Context, db caseRowsQuerier, ids []string) (map[string]int64, error) {
	seen := make(map[string]struct{})
	var unique []string
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	if len(unique) == 0 {
		return map[string]int64{}, nil
	}
	ph := strings.Repeat("?,", len(unique)-1) + "?"
	args := make([]any, len(unique))
	for i, id := range unique {
		args[i] = id
	}
	rows, err := db.QueryContext(ctx, "SELECT id, value FROM items WHERE id IN ("+ph+")", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]int64)
	for rows.Next() {
		var id string
		var v int64
		if err := rows.Scan(&id, &v); err != nil {
			continue
		}
		out[id] = v
	}
	return out, rows.Err()
}

// EnrichCaseItems sets each item's Value from the items catalog, recomputes case price as
// ceil(EV * houseEdge) where EV = Σ (chance/totalChance) * value and houseEdge defaults to 1.05 (5%).
// Override with env CASE_OPEN_HOUSE_EDGE_PERCENT (e.g. "7.5" for 7.5%).
func EnrichCaseItems(ctx context.Context, db caseRowsQuerier, items []CaseItem) (price int64, minV int64, maxV int64, err error) {
	if len(items) == 0 {
		return 0, 0, 0, fmt.Errorf("case has no items")
	}
	ids := make([]string, 0, len(items))
	for _, it := range items {
		ids = append(ids, it.ID)
	}
	values, err := fetchItemValuesByIDs(ctx, db, ids)
	if err != nil {
		return 0, 0, 0, err
	}
	var totalW float64
	for _, it := range items {
		ch := it.Chance
		if ch < 0 {
			ch = 0
		}
		totalW += ch
	}
	if totalW <= 0 {
		return 0, 0, 0, fmt.Errorf("case has zero total weight")
	}
	minV = math.MaxInt64
	maxV = math.MinInt64
	var ev float64
	for i := range items {
		v := values[items[i].ID]
		items[i].Value = v
		ch := items[i].Chance
		if ch < 0 {
			ch = 0
		}
		p := ch / totalW
		ev += p * float64(v)
		if v < minV {
			minV = v
		}
		if v > maxV {
			maxV = v
		}
	}
	if minV == math.MaxInt64 {
		minV = 0
	}
	if maxV == math.MinInt64 {
		maxV = 0
	}
	price = int64(math.Ceil(ev * caseOpenHouseEdgeMultiplier()))
	if price < 0 {
		price = 0
	}
	return price, minV, maxV, nil
}
