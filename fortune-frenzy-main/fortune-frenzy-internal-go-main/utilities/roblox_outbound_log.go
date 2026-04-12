package utilities

import (
	"encoding/json"
	"log"
	"os"
	"strconv"
	"strings"
)

// Roblox outbound logging (POST /packet/:serverId → HttpService body Roblox decodes).
// LOG_ROBLOX_OUTBOUND:
//   off (default) — no extra logs
//   summary — one line per sub-request: route, status, body JSON (first 4KB)
//   full — one line with the entire batch JSON (cap LOG_ROBLOX_OUTBOUND_MAX_BYTES, default 2MiB)
//   both | 1 | true | yes — summary and full
// LOG_ROBLOX_OUTBOUND_MAX_BYTES: cap for full JSON log (default 2097152).

func robloxOutboundMode() string {
	v := strings.TrimSpace(strings.ToLower(os.Getenv("LOG_ROBLOX_OUTBOUND")))
	switch v {
	case "1", "true", "yes", "both":
		return "both"
	case "full":
		return "full"
	case "summary", "short":
		return "summary"
	case "0", "false", "no", "off", "":
		return "off"
	default:
		return v
	}
}

func robloxOutboundWantSummary() bool {
	switch robloxOutboundMode() {
	case "summary", "both":
		return true
	default:
		return false
	}
}

func robloxOutboundWantFull() bool {
	switch robloxOutboundMode() {
	case "full", "both":
		return true
	default:
		return false
	}
}

func robloxOutboundMaxBytes() int {
	const defaultMax = 2 << 20 // 2 MiB
	s := strings.TrimSpace(os.Getenv("LOG_ROBLOX_OUTBOUND_MAX_BYTES"))
	if s == "" {
		return defaultMax
	}
	n, err := strconv.Atoi(s)
	if err != nil || n <= 0 {
		return defaultMax
	}
	return n
}

func truncateRunes(s string, max int) string {
	if max <= 0 || len(s) <= max {
		return s
	}
	return s[:max] + "...[truncated]"
}

// LogRobloxPacketSubresponse logs one batched sub-response (summary / both mode).
func LogRobloxPacketSubresponse(serverID, requestID, method, route string, status int, parsedBody any) {
	if !robloxOutboundWantSummary() {
		return
	}
	preview := ""
	if parsedBody != nil {
		if b, err := json.Marshal(parsedBody); err == nil {
			preview = truncateRunes(string(b), 4096)
		}
	}
	log.Printf("[roblox-outbound] server_id=%s request_id=%s %s %s -> status=%d body_json=%s",
		serverID, requestID, method, route, status, preview)
}

// LogRobloxPacketFull logs the exact JSON object returned to Roblox (full / both mode).
func LogRobloxPacketFull(serverID string, outbound any) {
	if !robloxOutboundWantFull() {
		return
	}
	b, err := json.Marshal(outbound)
	if err != nil {
		log.Printf("[roblox-outbound] server_id=%s full_json marshal error: %v", serverID, err)
		return
	}
	max := robloxOutboundMaxBytes()
	body := string(b)
	if len(body) > max {
		body = body[:max] + "...[truncated, set LOG_ROBLOX_OUTBOUND_MAX_BYTES to raise cap]"
	}
	log.Printf("[roblox-outbound] server_id=%s full_packet_json=%s", serverID, body)
}
