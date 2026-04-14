package cases

import "time"

const caseRotationFallbackDays = 3

// nextRotationFallback is used when cases_catalog.next_rotation is NULL:
// 06:00 UTC, caseRotationFallbackDays calendar days after the local calendar date of now (same pattern as the old +1 day default).
func nextRotationFallback(now time.Time) time.Time {
	return time.Date(now.Year(), now.Month(), now.Day()+caseRotationFallbackDays, 6, 0, 0, 0, time.UTC)
}
