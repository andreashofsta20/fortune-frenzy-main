package utilities

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"ffinternal-go/service"
)

var (
	discordWebhookURL string
	webhookOnce        sync.Once
	webhookClient      = &http.Client{Timeout: 5 * time.Second}
	webhookQueue       = make(chan discordMessage, 200)
)

type discordMessage struct {
	Content          string            `json:"content,omitempty"`
	AllowedMentions  *allowedMentions  `json:"allowed_mentions,omitempty"`
	Embeds           []discordEmbed    `json:"embeds,omitempty"`
}

type allowedMentions struct {
	Parse []string `json:"parse,omitempty"`
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

func discordPingHere(embeds []discordEmbed) discordMessage {
	return discordMessage{
		Content: "@here",
		AllowedMentions: &allowedMentions{
			Parse: []string{"everyone"},
		},
		Embeds: embeds,
	}
}

// DiscordRelayLevelIsError returns whether a Roblox/client log level should post to the error webhook.
func DiscordRelayLevelIsError(level string) bool {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "error", "err", "critical", "fatal", "exception":
		return true
	default:
		return false
	}
}

type discordRedisPayload struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Priority    string `json:"priority"`
}

// Publish compact log JSON to Redis channel api_discord_log for the Nova Discord bot (optional).
func publishDiscordLogRedis(title, description, priority string) {
	if os.Getenv("DISCORD_REDIS_RELAY_ENABLED") != "true" {
		return
	}
	if len(description) > 3500 {
		description = description[:3500] + "…"
	}
	b, err := json.Marshal(discordRedisPayload{Title: title, Description: description, Priority: priority})
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	ch := os.Getenv("DISCORD_REDIS_RELAY_CHANNEL")
	if ch == "" {
		ch = "api_discord_log"
	}
	if err := service.GetRedisConnection().Publish(ctx, ch, b).Err(); err != nil {
		log.Printf("[DiscordRelayRedis] publish failed: %v", err)
	}
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

	sendToDiscord(discordPingHere([]discordEmbed{{
		Title:       "Error: " + source,
		Description: message,
		Color:       0xE74C3C,
		Fields:      fields,
		Timestamp:   time.Now().UTC().Format(time.RFC3339),
		Footer:      &embedFooter{Text: "FF API"},
	}}))
	desc := message
	for k, v := range details {
		if len(desc) > 3000 {
			break
		}
		desc += "\n" + k + ": " + v
	}
	publishDiscordLogRedis("Error: "+source, desc, "Danger")
}

func DiscordLogInternalError(handler, coinflipOrBattleID, message string) {
	sendToDiscord(discordPingHere([]discordEmbed{{
		Title:       "Internal Error: " + handler,
		Description: message,
		Color:       0xE74C3C,
		Fields: []embedField{
			{Name: "ID", Value: coinflipOrBattleID, Inline: true},
		},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Footer:    &embedFooter{Text: "FF API"},
	}}))
	publishDiscordLogRedis(
		"Internal Error: "+handler,
		message+"\nID: "+coinflipOrBattleID,
		"Danger",
	)
}
