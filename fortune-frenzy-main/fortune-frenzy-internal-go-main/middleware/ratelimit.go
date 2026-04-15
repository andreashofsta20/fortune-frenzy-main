package middleware

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode"

	"ffinternal-go/service"

	"github.com/gofiber/fiber/v2"
)

// Rate limiting uses Redis fixed windows. Sub-requests from app.Test set packeter-master-key
// and internal flows set x-internal-authentication; those bypass limits so normal packet batches are not throttled.

func shouldBypassRateLimit(c *fiber.Ctx) bool {
	bypass := os.Getenv("PACKETER_BYPASS_KEY")
	if bypass != "" && c.Get("packeter-master-key") == bypass {
		return true
	}
	if c.Get("x-internal-authentication") != "" || c.Get("internal-authentication") != "" {
		return true
	}
	return false
}

func envRateLimitMax(envKey string, defaultMax int) int {
	s := strings.TrimSpace(os.Getenv(envKey))
	if s == "" {
		return defaultMax
	}
	v, err := strconv.Atoi(s)
	if err != nil || v < 0 {
		return defaultMax
	}
	return v
}

func sanitizeRateLimitID(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "unknown"
	}
	var b strings.Builder
	for _, r := range s {
		if b.Len() >= 96 {
			break
		}
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' {
			b.WriteRune(r)
		} else if r == '.' || r == ':' {
			b.WriteByte('_')
		}
	}
	out := b.String()
	if out == "" {
		return "x"
	}
	return out
}

func clientKeyServerOrIP(c *fiber.Ctx) string {
	sid := strings.TrimSpace(c.Get("server-id"))
	if sid != "" {
		return "s:" + sanitizeRateLimitID(sid)
	}
	return "ip:" + sanitizeRateLimitID(c.IP())
}

func clientKeyPathServerID(c *fiber.Ctx, param string) string {
	sid := strings.TrimSpace(c.Params(param))
	if sid != "" {
		return "s:" + sanitizeRateLimitID(sid)
	}
	return "ip:" + sanitizeRateLimitID(c.IP())
}

type rlOptions struct {
	class     string
	envKey    string
	defaultMax int
	window    time.Duration
	keyFn     func(*fiber.Ctx) string
}

func rateLimitMiddleware(opts rlOptions) fiber.Handler {
	max := envRateLimitMax(opts.envKey, opts.defaultMax)
	windowSec := int64(opts.window / time.Second)
	if windowSec < 1 {
		windowSec = 60
	}

	return func(c *fiber.Ctx) error {
		if shouldBypassRateLimit(c) {
			return c.Next()
		}
		if max <= 0 {
			return c.Next()
		}

		clientID := opts.keyFn(c)
		bucket := time.Now().Unix() / windowSec
		key := fmt.Sprintf("rl:v1:%s:%s:%d", opts.class, clientID, bucket)

		ctx, cancel := context.WithTimeout(c.Context(), 2*time.Second)
		defer cancel()

		rdb := service.GetRedisConnection()
		n, err := rdb.Incr(ctx, key).Result()
		if err != nil {
			log.Printf("[ratelimit] redis incr %s: %v", key, err)
			return c.Next()
		}
		if n == 1 {
			_ = rdb.Expire(ctx, key, opts.window+45*time.Second).Err()
		}

		if int(n) > max {
			elapsed := time.Now().Unix() % windowSec
			retry := windowSec - elapsed
			if retry < 1 {
				retry = 1
			}
			c.Set("Retry-After", strconv.FormatInt(retry, 10))
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error":       "Too many requests",
				"retry_after": retry,
			})
		}

		c.Set("X-RateLimit-Limit", strconv.Itoa(max))
		remaining := max - int(n)
		if remaining < 0 {
			remaining = 0
		}
		c.Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
		reset := (bucket+1)*windowSec
		c.Set("X-RateLimit-Reset", strconv.FormatInt(reset, 10))

		return c.Next()
	}
}

// RateLimitRead applies a generous per-window cap for read traffic (GET), keyed by server-id or client IP.
func RateLimitRead() fiber.Handler {
	return rateLimitMiddleware(rlOptions{
		class:      "read",
		envKey:     "RL_READ_PER_MIN",
		defaultMax: 2000,
		window:     time.Minute,
		keyFn:      clientKeyServerOrIP,
	})
}

// RateLimitWrite caps general mutating requests (POST etc.) per server or IP.
func RateLimitWrite() fiber.Handler {
	return rateLimitMiddleware(rlOptions{
		class:      "write",
		envKey:     "RL_WRITE_PER_MIN",
		defaultMax: 320,
		window:     time.Minute,
		keyFn:      clientKeyServerOrIP,
	})
}

// RateLimitStrict caps high-impact economy / case / transfer style endpoints.
func RateLimitStrict() fiber.Handler {
	return rateLimitMiddleware(rlOptions{
		class:      "strict",
		envKey:     "RL_STRICT_PER_MIN",
		defaultMax: 55,
		window:     time.Minute,
		keyFn:      clientKeyServerOrIP,
	})
}

// RateLimitPacket limits the outer Roblox packet POST per game server id (URL param).
func RateLimitPacket() fiber.Handler {
	return rateLimitMiddleware(rlOptions{
		class:      "packet",
		envKey:     "RL_PACKET_PER_MIN",
		defaultMax: 720,
		window:     time.Minute,
		keyFn: func(c *fiber.Ctx) string {
			return clientKeyPathServerID(c, "serverId")
		},
	})
}

// RateLimitRegister limits POST /register/:serverId by client IP (no server-id header yet).
func RateLimitRegister() fiber.Handler {
	return rateLimitMiddleware(rlOptions{
		class:      "register",
		envKey:     "RL_REGISTER_PER_MIN",
		defaultMax: 40,
		window:     time.Minute,
		keyFn: func(c *fiber.Ctx) string {
			return "ip:" + sanitizeRateLimitID(c.IP())
		},
	})
}
