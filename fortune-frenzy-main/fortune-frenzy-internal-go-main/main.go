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

func main() {
	_ = godotenv.Load()

	service.InitMariaDB()
	service.InitMongoDB()
	service.InitRedis()
	app := fiber.New()

	app.Use(middleware.RequestTimer())

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	app.Post("/register/:serverId", middleware.RateLimitRegister(), func(c *fiber.Ctx) error {
		serverID := c.Params("serverId")
		apiKey := c.Get("x-api-key")
		if serverID == "" || apiKey == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing server ID or API key"})
		}
		redis := service.GetRedisConnection()
		hashedKey := fmt.Sprintf("%x", sha256.Sum256([]byte(apiKey)))
		redis.Set(c.Context(), "api_key:"+serverID, hashedKey, 24*time.Hour)
		redis.Set(c.Context(), "servers:"+serverID+":active", "true", 5*time.Minute)
		return c.JSON(fiber.Map{"status": "OK"})
	})

	app.Post("/packet/:serverId", middleware.RateLimitPacket(), func(c *fiber.Ctx) error {
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

		type packetResponse struct {
			RequestID string `json:"request_id"`
			Response  [2]any `json:"response"`
		}
		responses := make([]packetResponse, 0, len(body.Packet))

		for _, req := range body.Packet {
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

			if resp.StatusCode >= 500 {
				preview := string(respBody)
				if len(preview) > 300 {
					preview = preview[:300]
				}
				utilities.DiscordLogError("PacketSubRequest", fmt.Sprintf("%s %s returned %d", req.Method, req.Route, resp.StatusCode), map[string]string{"body": preview})
			}
		}

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
	workers.StartCaseRotationWorker()
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
