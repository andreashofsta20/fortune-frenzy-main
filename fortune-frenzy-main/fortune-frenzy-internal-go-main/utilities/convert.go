package utilities

import "strconv"

func Int64ToString(n int64) string {
	return strconv.FormatInt(n, 10)
}
