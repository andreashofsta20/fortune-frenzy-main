package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"ffinternal-go/service"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
)

type AuthType string

const (
	AuthTypeServerKey AuthType = "server_key"
	AuthTypeMasterKey AuthType = "master_key"
)

type AuthError struct {
	Message string
}

func (e *AuthError) Error() string {
	return e.Message
}

func Authorization(authType AuthType, requiredHeaders ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		log.Printf("Starting authorization check for route: %s %s", c.Method(), c.Path())

		masterKey := os.Getenv("MASTER_KEY")
		packeterBypassKey := os.Getenv("PACKETER_BYPASS_KEY")

		validateHeaders := func(headers []string) error {
			log.Printf("Validating required headers: %v", headers)
			for _, header := range headers {
				if c.Get(header) == "" {
					log.Printf("Missing required header: %s", header)
					return &AuthError{Message: "Missing required header: " + header}
				}
			}
			return nil
		}

		validateInternalAuth := func() error {
			log.Print("Validating internal authentication")
			key := c.Get("internal-authentication")
			if key == "" {
				log.Print("Missing internal authentication key")
				return &AuthError{Message: "Missing internal authentication key"}
			}

			redis := service.GetRedisConnection()
			storedKey, err := redis.Get(c.Context(), "tempauth:"+key).Result()
			if err != nil || key != storedKey {
				log.Printf("Invalid internal authentication key: %v", err)
				return &AuthError{Message: "Invalid internal authentication key"}
			}

			_, err = redis.Del(c.Context(), "tempauth:"+key).Result()
			if err != nil {
				log.Printf("Failed to delete temp auth key: %v", err)
			}
			log.Print("Internal authentication successful")
			return nil
		}

		validateServerKey := func() error {
			log.Print("Validating server key")
			if c.Get("packeter-master-key") == packeterBypassKey {
				log.Print("Packeter bypass key validated")
				return nil
			}

			serverID := c.Get("server-id")
			apiKey := c.Get("api-key")

			if serverID == "" || apiKey == "" {
				log.Print("Missing server-id or api-key")
				return &AuthError{Message: "Missing required headers for server authentication"}
			}

			log.Printf("Checking API key for server ID: %s", serverID)

			redis := service.GetRedisConnection()
			storedApiKey, err := redis.Get(c.Context(), "api_key:"+serverID).Result()
			if err != nil {
				log.Printf("Failed to get stored API key: %v", err)
				return &AuthError{Message: "Invalid API key"}
			}

			hashedApiKey := sha256.Sum256([]byte(apiKey))
			hashedApiKeyHex := hex.EncodeToString(hashedApiKey[:])

			if hashedApiKeyHex != storedApiKey {
				log.Print("API key hash mismatch")
				return &AuthError{Message: "Invalid API key"}
			}
			log.Print("Server key validation successful")
			return nil
		}

		validateMasterKey := func() error {
			log.Print("Validating master key")
			if err := validateHeaders([]string{"master-key"}); err != nil {
				return err
			}
			if c.Get("master-key") != masterKey {
				log.Print("Invalid master key")
				return &AuthError{Message: "Invalid master key"}
			}
			log.Print("Master key validation successful")
			return nil
		}

		var authErr error

		if c.Get("internal-authentication") != "" {
			authErr = validateInternalAuth()
		} else if authType == AuthTypeServerKey {
			if len(requiredHeaders) > 0 && c.Get("packeter-master-key") != packeterBypassKey {
				authErr = validateHeaders(requiredHeaders)
			}
			if authErr == nil {
				authErr = validateServerKey()
			}
		} else if authType == AuthTypeMasterKey {
			authErr = validateMasterKey()
		}

		if authErr != nil {
			log.Printf("Auth failed: %v", authErr)
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": authErr.Error()})
		}

		log.Print("Authorization successful")
		return c.Next()
	}
}
