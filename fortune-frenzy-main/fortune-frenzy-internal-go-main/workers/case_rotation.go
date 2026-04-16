package workers

import (
	"context"
	"database/sql"
	"encoding/json"
	"ffinternal-go/handlers/cases"
	"ffinternal-go/service"
	"fmt"
	"log"
	"slices"
	"time"
)

const caseRotationPollInterval = 2 * time.Minute

// Global case contents: cases_catalog is shared by every game server until the next daily rotation here.
// Price and win odds for those same item ids are not fixed in the DB — they are recomputed on each API
// enrich from live Rolimons values (see handlers/cases/pricing.go inverse-value weights + house edge).

// Rolimons-backed value bands per case id: only rows in `items` with category=limited and id limited_*.
// Stratified sampling fills four value quartiles within each band so every case has a spread from "floor" to "ceiling" of that tier.
// Bands widen automatically if a quartile has too few catalog rows.
var dailyCaseValueBands = map[string]struct{ Min, Max int64 }{
	"starter":   {80, 8_000},          // entry limiteds
	"street":    {400, 22_000},
	"premium":   {5_000, 180_000},
	"royal":     {35_000, 450_000},
	"legend":    {120_000, 1_200_000},
	"mythic":    {450_000, 35_000_000}, // genuinely high-end public case
	"vip_elite": {2_500_000, 120_000_000},
	"vip_apex":  {12_000_000, 900_000_000},
}

func StartCaseRotationWorker() {
	go func() {
		time.Sleep(20 * time.Second)
		for {
			if err := maybeRotateDailyCases(); err != nil {
				log.Printf("[CaseRotation] %v", err)
			}
			time.Sleep(caseRotationPollInterval)
		}
	}()
}

func maybeRotateDailyCases() error {
	ctx := context.Background()
	now := time.Now().UTC()

	tx0, err := service.BeginMariaDBTx(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx0.Rollback() }()

	var minNext sql.NullTime
	err = tx0.QueryRowContext(ctx, `SELECT MIN(next_rotation) FROM cases_catalog`).Scan(&minNext)
	if err != nil {
		return fmt.Errorf("read next_rotation: %w", err)
	}
	if minNext.Valid && minNext.Time.After(now) {
		return nil
	}

	nextRot := cases.NextCaseRotationAfter(now)

	ids := make([]string, 0, len(dailyCaseValueBands))
	for id := range dailyCaseValueBands {
		ids = append(ids, id)
	}
	slices.Sort(ids)

	for _, caseID := range ids {
		band, ok := dailyCaseValueBands[caseID]
		if !ok {
			continue
		}
		var rowID string
		err := tx0.QueryRowContext(ctx, `SELECT id FROM cases_catalog WHERE id = ? LIMIT 1`, caseID).Scan(&rowID)
		if err == sql.ErrNoRows {
			continue
		}
		if err != nil {
			return fmt.Errorf("lookup case %s: %w", caseID, err)
		}

		items, err := buildRotatedCaseItems(ctx, tx0, band.Min, band.Max)
		if err != nil {
			return fmt.Errorf("case %s: %w", caseID, err)
		}
		price, minV, maxV, err := cases.EnrichCaseItems(ctx, tx0, items)
		if err != nil {
			return fmt.Errorf("enrich %s: %w", caseID, err)
		}
		itemsJSON, err := json.Marshal(items)
		if err != nil {
			return fmt.Errorf("marshal %s: %w", caseID, err)
		}

		_, err = tx0.ExecContext(ctx,
			`UPDATE cases_catalog SET items = ?, next_rotation = ?, price = ?, min_value = ?, max_value = ?, opened_count = 0 WHERE id = ?`,
			string(itemsJSON), nextRot, price, minV, maxV, caseID,
		)
		if err != nil {
			return fmt.Errorf("update %s: %w", caseID, err)
		}
		log.Printf("[CaseRotation] Rotated case %s next=%s price=%d", caseID, nextRot.Format(time.RFC3339), price)
	}

	if err := tx0.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

func buildRotatedCaseItems(ctx context.Context, db *sql.Tx, minV, maxV int64) ([]cases.CaseItem, error) {
	picked, err := pickStratifiedLimitedIDs(ctx, db, minV, maxV, 4)
	if err != nil {
		return nil, err
	}
	out := make([]cases.CaseItem, len(picked))
	for i, id := range picked {
		out[i] = cases.CaseItem{
			ID:      id,
			Chance:  1,
			Claimed: 0,
		}
	}
	return out, nil
}

func pickOneLimitedInRange(ctx context.Context, db *sql.Tx, lo, hi int64, exclude map[string]struct{}) (string, error) {
	const base = `SELECT id FROM items
		WHERE category = 'limited' AND id LIKE 'limited/_%' ESCAPE '/' AND value >= ? AND value <= ?`
	for attempt := 0; attempt < 10; attempt++ {
		row := db.QueryRowContext(ctx, base+` ORDER BY RAND() LIMIT 1`, lo, hi)
		var id string
		if err := row.Scan(&id); err == sql.ErrNoRows {
			return "", nil
		} else if err != nil {
			return "", err
		}
		if id == "" {
			continue
		}
		if _, dup := exclude[id]; dup {
			continue
		}
		return id, nil
	}
	return "", nil
}

// Fallback when stratified band is too sparse: widen entire [minV,maxV] until 4 distinct limiteds exist.
func pickLimitedItemIDsFallback(ctx context.Context, db *sql.Tx, minV, maxV int64, need int) ([]string, error) {
	low, high := minV, maxV
	for attempt := 0; attempt < 18; attempt++ {
		const q = `SELECT id FROM items
			WHERE category = 'limited' AND id LIKE 'limited/_%' ESCAPE '/' AND value >= ? AND value <= ?
			ORDER BY RAND() LIMIT ?`
		rows, err := db.QueryContext(ctx, q, low, high, need*3)
		if err != nil {
			return nil, err
		}
		var ids []string
		seen := make(map[string]struct{})
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			ids = append(ids, id)
			if len(ids) >= need {
				break
			}
		}
		rerr := rows.Err()
		cerr := rows.Close()
		if rerr != nil {
			return nil, rerr
		}
		if cerr != nil {
			return nil, cerr
		}
		if len(ids) >= need {
			return ids[:need], nil
		}
		if low > 50 {
			low = low * 7 / 10
		}
		high = high*13/10 + 1
		if high > 2_000_000_000 {
			high = 2_000_000_000
		}
	}
	return nil, fmt.Errorf("not enough Rolimons limiteds in band %d-%d", minV, maxV)
}

func pickStratifiedLimitedIDs(ctx context.Context, db *sql.Tx, minV, maxV int64, slots int) ([]string, error) {
	ids, err := pickStratifiedLimitedIDsInner(ctx, db, minV, maxV, slots)
	if err != nil {
		return nil, err
	}
	if len(ids) < slots {
		return pickLimitedItemIDsFallback(ctx, db, minV, maxV, slots)
	}
	return ids, nil
}

func pickStratifiedLimitedIDsInner(ctx context.Context, db *sql.Tx, minV, maxV int64, slots int) ([]string, error) {
	if minV >= maxV {
		return nil, fmt.Errorf("invalid band %d-%d", minV, maxV)
	}
	seen := make(map[string]struct{})
	var out []string

	for q := 0; q < slots; q++ {
		qLo := minV + (maxV-minV)*int64(q)/int64(slots)
		qHi := minV + (maxV-minV)*int64(q+1)/int64(slots)
		if q == slots-1 {
			qHi = maxV
		}
		id, err := pickOneLimitedInRange(ctx, db, qLo, qHi, seen)
		if err != nil {
			return nil, err
		}
		if id == "" {
			id, err = pickOneLimitedInRange(ctx, db, minV, maxV, seen)
			if err != nil {
				return nil, err
			}
		}
		if id == "" {
			return out, nil
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out, nil
}
