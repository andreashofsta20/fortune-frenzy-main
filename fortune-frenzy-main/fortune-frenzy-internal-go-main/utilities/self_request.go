package utilities

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"ffinternal-go/service"
)

const (
	KeyLength      = 16
	AuthTTL        = 60 * time.Second
	// internalHTTPTimeout caps self-calls (coinflip start, transfers, etc.) so a stuck handler
	// does not leave Redis stuck on awaiting_confirmation forever.
	internalHTTPTimeout = 120 * time.Second
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

func listenPort() string {
	p := strings.TrimSpace(os.Getenv("PORT"))
	if p == "" {
		return "3004"
	}
	return p
}

func internalHTTPClient() *http.Client {
	timeout := internalHTTPTimeout
	if s := strings.TrimSpace(os.Getenv("INTERNAL_HTTP_TIMEOUT_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			timeout = time.Duration(n) * time.Second
		}
	}
	return &http.Client{Timeout: timeout}
}

// InternalRequestForwarded performs a self-HTTP call using a header snapshot. Redis temp auth
// uses context.Background so it is safe from goroutines after the request has finished.
func InternalRequestForwarded(method, urlPath string, body any, forwardHeaders map[string]string) (*fiber.Response, error) {
	redisClient := service.GetRedisConnection()

	keyBytes := make([]byte, KeyLength)
	if _, err := rand.Read(keyBytes); err != nil {
		return nil, fmt.Errorf("failed to generate random key: %w", err)
	}
	key := hex.EncodeToString(keyBytes)

	if err := redisClient.Set(context.Background(), "tempauth:"+key, key, AuthTTL).Err(); err != nil {
		return nil, fmt.Errorf("failed to set key in Redis: %w", err)
	}

	fullURL := "http://127.0.0.1:" + listenPort() + urlPath
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(context.Background(), method, fullURL, bodyReader)
	if err != nil {
		return nil, err
	}

	stripInternalAuthHeaders(forwardHeaders)
	for k, v := range forwardHeaders {
		req.Header.Set(k, v)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("x-internal-authentication", key)

	httpResp, err := internalHTTPClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("internal http %s %s: %w", method, urlPath, err)
	}
	defer httpResp.Body.Close()
	respBody, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	resp := fiber.AcquireResponse()
	resp.SetStatusCode(httpResp.StatusCode)
	resp.SetBody(respBody)
	return resp, nil
}

func InternalRequest(c *fiber.Ctx, method, url string, body any) (*fiber.Response, error) {
	return InternalRequestForwarded(method, url, body, CopyRequestHeaders(c))
}
