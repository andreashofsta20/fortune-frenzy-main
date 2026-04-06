package service

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

var pool *sql.DB

func InitMariaDB() {
	log.Println("Initializing MariaDB")

	var err error
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?parseTime=true",
		os.Getenv("MARIADB_USER"),
		os.Getenv("MARIADB_PASSWORD"),
		os.Getenv("MARIADB_HOST"),
		6033,
		"Game1",
	)

	pool, err = sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Failed to connect to MariaDB: %v", err)
	}

	pool.SetMaxOpenConns(50)
	pool.SetMaxIdleConns(10)
	pool.SetConnMaxLifetime(0)
	pool.SetConnMaxIdleTime(60 * time.Second)

	if err = pool.Ping(); err != nil {
		log.Fatalf("Failed to ping MariaDB: %v", err)
	}

	log.Println("Connected to MariaDB")
}

func GetMariaDBConnection() (*sql.Conn, error) {
	if pool == nil {
		InitMariaDB()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	conn, err := pool.Conn(ctx)
	if err != nil {
		log.Printf("Failed to get connection from pool: %v", err)
		return nil, fmt.Errorf("failed to get connection from pool: %v", err)
	}

	return conn, nil
}
