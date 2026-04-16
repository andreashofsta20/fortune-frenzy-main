package cases

import "time"

// caseRotationHourUTC is when daily item pools roll over (UTC).
const caseRotationHourUTC = 6

// NextCaseRotationAfter returns the next daily boundary at caseRotationHourUTC UTC, strictly after `from`.
func NextCaseRotationAfter(from time.Time) time.Time {
	utc := from.UTC()
	y, m, d := utc.Date()
	cand := time.Date(y, m, d, caseRotationHourUTC, 0, 0, 0, time.UTC)
	if !utc.Before(cand) {
		cand = cand.Add(24 * time.Hour)
	}
	return cand
}

// nextRotationFallback is used when cases_catalog.next_rotation is NULL (same rule as the rotation worker).
func nextRotationFallback(now time.Time) time.Time {
	return NextCaseRotationAfter(now)
}
