package utilities

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

var (
	discordWebhookURL string
	webhookOnce        sync.Once
	webhookClient      = &http.Client{Timeout: 5 * time.Second}
	webhookQueue       = make(chan discordMessage, 200)
)

type discordMessage struct {
	Content string         `json:"content,omitempty"`
	Embeds  []discordEmbed `json:"embeds,omitempty"`
}

type discordEmbed struct {
	Title       string        `json:"title,omitempty"`
	Description string        `json:"description,omitempty"`
	Color       int           `json:"color,omitempty"`
	Fields      []embedField  `json:"fields,omitempty"`
	Timestamp   string        `json:"timestamp,omitempty"`
	Footer      *embedFooter  `json:"footer,omitempty"`
}

type embedField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline,omitempty"`
}

type embedFooter struct {
	Text string `json:"text"`
}

func initWebhook() {
	discordWebhookURL = os.Getenv("DISCORD_WEBHOOK_URL")
	if discordWebhookURL == "" {
		log.Println("[DiscordWebhook] DISCORD_WEBHOOK_URL is empty; Discord logging disabled")
		return
	}
	log.Println("[DiscordWebhook] Webhook configured")
	go webhookWorker()
}

func webhookWorker() {
	for msg := range webhookQueue {
		body, err := json.Marshal(msg)
		if err != nil {
			continue
		}
		req, err := http.NewRequest("POST", discordWebhookURL, bytes.NewReader(body))
		if err != nil {
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := webhookClient.Do(req)
		if err != nil {
			log.Printf("[DiscordWebhook] send failed: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}
		resp.Body.Close()
		if resp.StatusCode == 429 {
			log.Println("[DiscordWebhook] rate limited by Discord")
			time.Sleep(2 * time.Second)
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			log.Printf("[DiscordWebhook] unexpected status from Discord: %d", resp.StatusCode)
		}
		time.Sleep(500 * time.Millisecond)
	}
}

func sendToDiscord(msg discordMessage) {
	webhookOnce.Do(initWebhook)
	if discordWebhookURL == "" {
		return
	}
	select {
	case webhookQueue <- msg:
	default:
	}
}

func DiscordLogRequest(method, path string, statusCode int, duration time.Duration, bodyPreview string) {
	color := 0x2ECC71 // green
	if statusCode >= 400 && statusCode < 500 {
		color = 0xE67E22 // orange
	} else if statusCode >= 500 {
		color = 0xE74C3C // red
	}

	if len(bodyPreview) > 500 {
		bodyPreview = bodyPreview[:500] + "..."
	}

	sendToDiscord(discordMessage{
		Embeds: []discordEmbed{{
			Title: fmt.Sprintf("%s %s → %d", method, path, statusCode),
			Color: color,
			Fields: []embedField{
				{Name: "Duration", Value: duration.String(), Inline: true},
				{Name: "Status", Value: fmt.Sprintf("%d", statusCode), Inline: true},
			},
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Footer:    &embedFooter{Text: "FF API"},
		}},
	})
}

func DiscordLogError(source, message string, details map[string]string) {
	fields := make([]embedField, 0, len(details)+1)
	fields = append(fields, embedField{Name: "Source", Value: source, Inline: true})
	for k, v := range details {
		if len(v) > 500 {
			v = v[:500] + "..."
		}
		fields = append(fields, embedField{Name: k, Value: v})
	}

	sendToDiscord(discordMessage{
		Embeds: []discordEmbed{{
			Title:       "Error: " + source,
			Description: message,
			Color:       0xE74C3C,
			Fields:      fields,
			Timestamp:   time.Now().UTC().Format(time.RFC3339),
			Footer:      &embedFooter{Text: "FF API"},
		}},
	})
}

func DiscordLogPacketBatch(serverID string, subRequests int, totalDuration time.Duration, routes []string) {
	routeList := ""
	for i, r := range routes {
		if i >= 10 {
			routeList += fmt.Sprintf("\n... and %d more", len(routes)-10)
			break
		}
		routeList += r + "\n"
	}

	sendToDiscord(discordMessage{
		Embeds: []discordEmbed{{
			Title: fmt.Sprintf("Packet batch from %s (%d sub-requests)", serverID, subRequests),
			Color: 0x3498DB,
			Fields: []embedField{
				{Name: "Server", Value: serverID, Inline: true},
				{Name: "Duration", Value: totalDuration.String(), Inline: true},
				{Name: "Routes", Value: "```\n" + routeList + "```"},
			},
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Footer:    &embedFooter{Text: "FF API"},
		}},
	})
}

func DiscordLogInternalError(handler, coinflipOrBattleID, message string) {
	sendToDiscord(discordMessage{
		Embeds: []discordEmbed{{
			Title:       "Internal Error: " + handler,
			Description: message,
			Color:       0xE74C3C,
			Fields: []embedField{
				{Name: "ID", Value: coinflipOrBattleID, Inline: true},
			},
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Footer:    &embedFooter{Text: "FF API"},
		}},
	})
}
