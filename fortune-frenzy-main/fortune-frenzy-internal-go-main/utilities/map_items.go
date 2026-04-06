package utilities

import "strings"

func MapItemsToIDs(items []string) []string {
	ids := make([]string, len(items))
	for i, item := range items {
		parts := strings.Split(item, ":")
		if len(parts) == 2 {
			ids[i] = parts[0]
		} else {
			ids[i] = item
		}
	}
	return ids
}