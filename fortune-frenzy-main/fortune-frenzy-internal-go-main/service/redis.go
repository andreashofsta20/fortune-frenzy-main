package service

import (
	"context"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

var client *redis.Client

func InitRedis() {
	log.Println("Initializing Redis")

	password := os.Getenv("REDIS_PASSWORD")
	host := os.Getenv("REDIS_HOST")
	portStr := os.Getenv("REDIS_PORT")

	port, err := strconv.Atoi(portStr)
	if err != nil {
		log.Fatalf("Failed to convert REDIS_PORT to int: %v", err)
	}

	client = redis.NewClient(&redis.Options{
		Password:        password,
		Addr:            host + ":" + strconv.Itoa(port),
		DB:              0,
		ConnMaxLifetime: time.Hour,
		ConnMaxIdleTime: 10 * time.Minute,
		DialTimeout:     5 * time.Second,
		ReadTimeout:     3 * time.Second,
		WriteTimeout:    3 * time.Second,
		PoolSize:        10,
		MinIdleConns:    2,
		MaxRetries:      3,
		MaxRetryBackoff: time.Second,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}

	go healthCheck()

	log.Println("Connected to Redis")
}

func healthCheck() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		if err := client.Ping(ctx).Err(); err != nil {
			log.Printf("Redis health check failed: %v", err)
		}
		cancel()
	}
}

func GetRedisConnection() *redis.Client {
	if client == nil {
		InitRedis()
	}
	return client
}

func CloseRedis() error {
	if client != nil {
		return client.Close()
	}
	return nil
}
