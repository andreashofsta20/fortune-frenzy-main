package utilities

import (
	"crypto/rand"
	"encoding/hex"
	"ffinternal-go/service"
	"fmt"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
)

const (
	KeyLength      = 16
	AuthTTL        = 60 * time.Second
	DefaultBaseURL = "http://localhost:"
)

func InternalRequest(c *fiber.Ctx, method, url string, body any) (*fiber.Response, error) {
	redisClient := service.GetRedisConnection()

	keyBytes := make([]byte, KeyLength)
	if _, err := rand.Read(keyBytes); err != nil {
		return nil, fmt.Errorf("failed to generate random key: %w", err)
	}
	key := hex.EncodeToString(keyBytes)

	if err := redisClient.Set(c.Context(), "tempauth:"+key, key, AuthTTL).Err(); err != nil {
		return nil, fmt.Errorf("failed to set key in Redis: %w", err)
	}

	agent := fiber.AcquireAgent()
	defer fiber.ReleaseAgent(agent)

	req := agent.Request()
	req.Header.SetMethod(method)
	req.SetRequestURI(DefaultBaseURL + os.Getenv("PORT") + url)
	req.Header.Set("x-internal-authentication", key)

	c.Request().Header.VisitAll(func(k, v []byte) {
		req.Header.Set(string(k), string(v))
	})

	if body != nil {
		agent.JSON(body)
	}

	if err := agent.Parse(); err != nil {
		return nil, fmt.Errorf("failed to parse request: %w", err)
	}

	statusCode, respBody, errs := agent.Bytes()
	if len(errs) > 0 {
		return nil, fmt.Errorf("request failed: %w", errs[0])
	}

	resp := fiber.AcquireResponse()
	defer fiber.ReleaseResponse(resp)
	resp.SetStatusCode(statusCode)
	resp.SetBody(respBody)
	return resp, nil
}
