package utilities

import (
	"context"
	"encoding/json"
	"ffinternal-go/service"
	"log"
	"os"
	"sync"

	"github.com/gofiber/fiber/v2"
)

type PacketElement struct {
	RequestID string            `json:"request_id"`
	Route     string            `json:"route"`
	Method    string            `json:"method"`
	Query     map[string]string `json:"query"`
	Body      map[string]any    `json:"body"`
	Headers   map[string]string `json:"headers"`
}

func Packeter(app *fiber.App, serverID string, packet []PacketElement) ([2]any, error) {
	redis := service.GetRedisConnection()
	ctx := context.Background()

	if len(packet) > 0 {
		var wg sync.WaitGroup
		errChan := make(chan error, len(packet))

		for _, element := range packet {
			wg.Add(1)
			go func(elem PacketElement) {
				defer wg.Done()

				routeExists := false
				for _, routes := range app.Stack() {
					for _, r := range routes {
						if r.Method == elem.Method && r.Path == elem.Route {
							routeExists = true
							break
						}
					}
					if routeExists {
						break
					}
				}
				if !routeExists {
					resp, _ := json.Marshal(map[string]any{
						"request_id": elem.RequestID,
						"response":   [2]any{404, map[string]string{"error": "Not Found"}},
					})
					if err := redis.HSet(ctx, "packet:"+serverID, elem.RequestID, string(resp)).Err(); err != nil {
						errChan <- err
					}
					return
				}

				agent := fiber.AcquireAgent()
				defer fiber.ReleaseAgent(agent)

				req := agent.Request()
				req.Header.SetMethod(elem.Method)
				req.SetRequestURI(elem.Route)
				for k, v := range elem.Query {
					req.URI().QueryArgs().Add(k, v)
				}
				if len(elem.Body) > 0 {
					body, _ := json.Marshal(elem.Body)
					req.SetBody(body)
					req.Header.SetContentType("application/json")
				}
				for k, v := range elem.Headers {
					req.Header.Set(k, v)
				}
				req.Header.Set("packeter-master-key", os.Getenv("PACKETER_BYPASS_KEY"))

				if err := agent.Parse(); err != nil {
					errChan <- err
					return
				}

				statusCode, body, err := agent.Bytes()
				if err != nil {
					log.Printf("Error processing request %s: %v", elem.RequestID, err)
					resp, _ := json.Marshal(map[string]any{
						"request_id": elem.RequestID,
						"response":   [2]any{500, map[string]string{"error": "Internal Server Error"}},
					})
					redis.HSet(ctx, "packet:"+serverID, elem.RequestID, string(resp))
					return
				}

				var responseBody any
				json.Unmarshal(body, &responseBody)
				resp, _ := json.Marshal(map[string]any{
					"request_id": elem.RequestID,
					"response":   [2]any{statusCode, responseBody},
				})
				if err := redis.HSet(ctx, "packet:"+serverID, elem.RequestID, string(resp)).Err(); err != nil {
					errChan <- err
				}
			}(element)
		}

		wg.Wait()
		close(errChan)

		for err := range errChan {
			if err != nil {
				return [2]any{500, map[string]string{"error": "Processing failed"}}, err
			}
		}
	}

	var wg sync.WaitGroup
	errChan := make(chan error, 2)

	wg.Add(2)
	go func() {
		defer wg.Done()
		if err := redis.Set(ctx, "servers:"+serverID+":active", "true", -1).Err(); err != nil {
			errChan <- err
		}
	}()
	go func() {
		defer wg.Done()
		packetJSON, _ := json.Marshal(packet)
		if err := redis.Set(ctx, "servers:"+serverID+":last_packet", string(packetJSON), -1).Err(); err != nil {
			errChan <- err
		}
	}()

	wg.Wait()
	close(errChan)
	for err := range errChan {
		if err != nil {
			return [2]any{500, map[string]string{"error": "Failed to update server status"}}, err
		}
	}

	responses, err := redis.HGetAll(ctx, "packet:"+serverID).Result()
	if err != nil {
		return [2]any{500, map[string]string{"error": "Failed to fetch responses"}}, err
	}

	responsesObject := make(map[string]any)
	for key, val := range responses {
		var parsed map[string]any
		json.Unmarshal([]byte(val), &parsed)
		responsesObject[key] = parsed
	}

	if len(responsesObject) > 0 {
		if err := redis.Del(ctx, "packet:"+serverID).Err(); err != nil {
			return [2]any{500, map[string]string{"error": "Failed to clear responses"}}, err
		}
	}

	return [2]any{
		200,
		map[string]any{
			"status":    "OK",
			"responses": responsesObject,
		},
	}, nil
}
