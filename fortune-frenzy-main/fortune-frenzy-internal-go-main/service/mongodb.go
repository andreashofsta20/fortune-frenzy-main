package service

import (
	"context"
	"log"
	"os"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	mongoClient     *mongo.Client
	mongoClientOnce sync.Once
	mongoInitErr    error
)

// InitMongoDB connects when MONGODB_URI is set. Safe to call multiple times.
func InitMongoDB() {
	mongoClientOnce.Do(func() {
		uri := os.Getenv("MONGODB_URI")
		if uri == "" {
			log.Println("MONGODB_URI not set; wallet stays on MariaDB cash_changes / external queue")
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
		if err != nil {
			mongoInitErr = err
			log.Printf("MongoDB connect failed: %v", err)
			return
		}
		if err = client.Ping(ctx, nil); err != nil {
			mongoInitErr = err
			_ = client.Disconnect(context.Background())
			log.Printf("MongoDB ping failed: %v", err)
			return
		}
		mongoClient = client
		log.Println("Connected to MongoDB (wallet)")
	})
}

// MongoWalletEnabled is true when the driver is connected and wallet routes should use MongoDB.
func MongoWalletEnabled() bool {
	return mongoClient != nil
}

// MongoInitError returns the last connection error, if any.
func MongoInitError() error {
	return mongoInitErr
}

func mongoDatabaseName() string {
	if d := os.Getenv("MONGODB_DATABASE"); d != "" {
		return d
	}
	return "fortune_frenzy"
}

// WalletsCollection is the primary wallet ledger (cash / gems).
func WalletsCollection() *mongo.Collection {
	if mongoClient == nil {
		return nil
	}
	return mongoClient.Database(mongoDatabaseName()).Collection("wallets")
}
