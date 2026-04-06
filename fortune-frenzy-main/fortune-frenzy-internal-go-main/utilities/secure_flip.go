package utilities

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
)

type SecureFlipResult struct {
	Result int
	Hash   string
}

func SecureFlip(extraEntropy []string, chance1, chance2 float64) (SecureFlipResult, error) {
	if chance1 <= 0 || chance2 <= 0 {
		return SecureFlipResult{}, fmt.Errorf("chances must be positive numbers")
	}

	totalChances := chance1 + chance2

	randomBytes := make([]byte, 32)
	if _, err := rand.Read(randomBytes); err != nil {
		return SecureFlipResult{}, err
	}

	hash := sha256.New()
	hash.Write(randomBytes)
	hash.Write([]byte(os.Getenv("SERVER_RANDOMNESS_SEED")))
	for _, entropy := range extraEntropy {
		hash.Write([]byte(entropy))
	}
	hashHex := hex.EncodeToString(hash.Sum(nil))

	randomValue, err := strconv.ParseInt(hashHex[:8], 16, 64)
	if err != nil {
		return SecureFlipResult{}, err
	}
	randomValue = randomValue % int64(totalChances)

	result := 1
	if float64(randomValue) >= chance1 {
		result = 2
	}

	return SecureFlipResult{
		Result: result,
		Hash:   hashHex,
	}, nil
}