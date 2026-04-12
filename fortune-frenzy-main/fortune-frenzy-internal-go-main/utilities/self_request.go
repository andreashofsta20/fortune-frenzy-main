package utilities

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"ffinternal-go/service"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

const (
	KeyLength      = 16
	AuthTTL        = 60 * time.Second
	DefaultBaseURL = "http://localhost:"
)

// CopyRequestHeaders snapshots incoming headers for use after the Fiber handler returns
// (e.g. delayed goroutines must not touch *fiber.Ctx).
func CopyRequestHeaders(c *fiber.Ctx) map[string]string {
	if c == nil {
		return nil
	}
	h := make(map[string]string)
	c.Request().Header.VisitAll(func(k, v []byte) {
		h[string(k)] = string(v)
	})
	return h
}

func stripInternalAuthHeaders(h map[string]string) {
	if h == nil {
		return
	}
	for k := range h {
		lk := strings.ToLower(strings.TrimSpace(k))
		if lk == "x-internal-authentication" || lk == "internal-authentication" {
			delete(h, k)
		}
	}
}

// InternalRequestForwarded performs a self-HTTP call using a header snapshot. Redis temp auth
// uses context.Background so it is safe from goroutines after the request has finished.
func InternalRequestForwarded(method, url string, body any, forwardHeaders map[string]string) (*fiber.Response, error) {
	redisClient := service.GetRedisConnection()

	keyBytes := make([]byte, KeyLength)
	if _, err := rand.Read(keyBytes); err != nil {
		return nil, fmt.Errorf("failed to generate random key: %w", err)
	}
	key := hex.EncodeToString(keyBytes)

	if err := redisClient.Set(context.Background(), "tempauth:"+key, key, AuthTTL).Err(); err != nil {
		return nil, fmt.Errorf("failed to set key in Redis: %w", err)
	}

	agent := fiber.AcquireAgent()
	defer fiber.ReleaseAgent(agent)

	req := agent.Request()
	req.Header.SetMethod(method)
	req.SetRequestURI(DefaultBaseURL + os.Getenv("PORT") + url)

	stripInternalAuthHeaders(forwardHeaders)
	// Apply forwarded headers first; never forward consumed temp-auth values.
	for k, v := range forwardHeaders {
		req.Header.Set(k, v)
	}

	if body != nil {
		agent.JSON(body)
	}

	// Set after body so nothing in the pipeline can replace the fresh Redis key.
	req.Header.Set("x-internal-authentication", key)

	if err := agent.Parse(); err != nil {
		return nil, fmt.Errorf("failed to parse request: %w", err)
	}

	statusCode, respBody, errs := agent.Bytes()
	if len(errs) > 0 {
		return nil, fmt.Errorf("request failed: %w", errs[0])
	}

	resp := fiber.AcquireResponse()
	resp.SetStatusCode(statusCode)
	resp.SetBody(respBody)
	return resp, nil
}

func InternalRequest(c *fiber.Ctx, method, url string, body any) (*fiber.Response, error) {
	return InternalRequestForwarded(method, url, body, CopyRequestHeaders(c))
}
