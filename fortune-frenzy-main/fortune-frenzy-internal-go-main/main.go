package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"ffinternal-go/middleware"
	"ffinternal-go/routes"
	"ffinternal-go/service"
	"ffinternal-go/utilities"
	"ffinternal-go/workers"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/joho/godotenv"
)

func emitAgentDebugLog(location, message, hypothesisID string, data map[string]any) {
	// #region agent log
	payload := map[string]any{
		"sessionId":    "4ef876",
		"location":     location,
		"message":      message,
		"data":         data,
		"timestamp":    time.Now().UnixMilli(),
		"runId":        "pre-fix",
		"hypothesisId": hypothesisID,
	}
	if b, err := json.Marshal(payload); err == nil {
		_ = os.WriteFile("/Users/52hofand/Downloads/Fortune-frenzy/.cursor/debug-4ef876.log", append(b, '\n'), 0644)
	}
	// #endregion
}

func main() {
	_ = godotenv.Load()

	service.InitMariaDB()
	service.InitRedis()
	app := fiber.New()

	app.Use(middleware.RequestTimer())

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	app.Post("/register/:serverId", func(c *fiber.Ctx) error {
		serverID := c.Params("serverId")
		apiKey := c.Get("x-api-key")
		// #region agent log
		emitAgentDebugLog("fortune-frenzy-internal-go-main/main.go:55", "register endpoint hit", "H1", map[string]any{
			"serverIDPresent": serverID != "",
			"apiKeyPresent":   apiKey != "",
		})
		// #endregion
		if serverID == "" || apiKey == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing server ID or API key"})
		}
		redis := service.GetRedisConnection()
		hashedKey := fmt.Sprintf("%x", sha256.Sum256([]byte(apiKey)))
		redis.Set(c.Context(), "api_key:"+serverID, hashedKey, 24*time.Hour)
		redis.Set(c.Context(), "servers:"+serverID+":active", "true", 5*time.Minute)
		return c.JSON(fiber.Map{"status": "OK"})
	})

	app.Post("/packet/:serverId", func(c *fiber.Ctx) error {
		batchStart := time.Now()
		serverID := c.Params("serverId")
		var body struct {
			Packet []struct {
				RequestID string            `json:"request_id"`
				Method    string            `json:"method"`
				Route     string            `json:"route"`
				Headers   map[string]string `json:"headers"`
				Body      json.RawMessage   `json:"body"`
			} `json:"Packet"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid packet"})
		}
		// #region agent log
		emitAgentDebugLog("fortune-frenzy-internal-go-main/main.go:83", "packet endpoint hit", "H3", map[string]any{
			"serverIDPresent": serverID != "",
			"packetSize":      len(body.Packet),
		})
		// #endregion

		type packetResponse struct {
			RequestID string `json:"request_id"`
			Response  [2]any `json:"response"`
		}
		responses := make([]packetResponse, 0, len(body.Packet))
		routes := make([]string, 0, len(body.Packet))

		for _, req := range body.Packet {
			routes = append(routes, fmt.Sprintf("%s %s", req.Method, req.Route))

			httpReq, err := http.NewRequest(req.Method, req.Route, bytes.NewReader(req.Body))
			if err != nil {
				payload := map[string]string{"error": "Bad request"}
				responses = append(responses, packetResponse{RequestID: req.RequestID, Response: [2]any{500, payload}})
				utilities.LogRobloxPacketSubresponse(serverID, req.RequestID, req.Method, req.Route, 500, payload)
				continue
			}
			httpReq.Header.Set("Content-Type", "application/json")
			httpReq.Header.Set("packeter-master-key", os.Getenv("PACKETER_BYPASS_KEY"))
			for k, v := range req.Headers {
				httpReq.Header.Set(k, v)
			}
			httpReq.Header.Set("server-id", serverID)

			resp, err := app.Test(httpReq, -1)
			if err != nil {
				payload := map[string]string{"error": "Internal error"}
				responses = append(responses, packetResponse{RequestID: req.RequestID, Response: [2]any{500, payload}})
				utilities.LogRobloxPacketSubresponse(serverID, req.RequestID, req.Method, req.Route, 500, payload)
				utilities.DiscordLogError("PacketSubRequest", fmt.Sprintf("Internal error on %s %s", req.Method, req.Route), map[string]string{"error": err.Error()})
				continue
			}

			respBody, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			var parsed any
			json.Unmarshal(respBody, &parsed)
			responses = append(responses, packetResponse{RequestID: req.RequestID, Response: [2]any{resp.StatusCode, parsed}})
			utilities.LogRobloxPacketSubresponse(serverID, req.RequestID, req.Method, req.Route, resp.StatusCode, parsed)

			if resp.StatusCode >= 400 {
				preview := string(respBody)
				if len(preview) > 300 {
					preview = preview[:300]
				}
				utilities.DiscordLogError("PacketSubRequest", fmt.Sprintf("%s %s returned %d", req.Method, req.Route, resp.StatusCode), map[string]string{"body": preview})
			}
		}
		// #region agent log
		emitAgentDebugLog("fortune-frenzy-internal-go-main/main.go:148", "packet endpoint completed", "H3", map[string]any{
			"serverID":   serverID,
			"routesHead": routes,
		})
		// #endregion

		utilities.DiscordLogPacketBatch(serverID, len(body.Packet), time.Since(batchStart), routes)

		out := fiber.Map{"status": "OK", "responses": responses}
		utilities.LogRobloxPacketFull(serverID, out)
		return c.JSON(out)
	})

	routes.SetupSettingsRoutes(app)
	routes.SetupUserRoutes(app)
	routes.SetupMarketplaceRoutes(app)
	routes.SetupCoinflipRoutes(app)
	routes.SetupCaseBattleRoutes(app)
	routes.SetupTradingRoutes(app)
	routes.SetupJackpotRoutes(app)
	routes.SetupItemRoutes(app)
	routes.SetupCaseRoutes(app)
	routes.SetupMiscRoutes(app)

	workers.StartRolimonsWorker()
	workers.StartLeaderboardWorker()

	port := os.Getenv("PORT")
	if port == "" {
		port = "3004"
	}
	addr := "0.0.0.0:" + port
	log.Println("Server is listening on " + addr)
	if err := app.Listen(addr); err != nil {
		log.Fatalf("Error starting server: %v", err)
	}
}
