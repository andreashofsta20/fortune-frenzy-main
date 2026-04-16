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
	port := os.Getenv("MARIADB_PORT")
	if port == "" {
		port = "3306"
	}
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true",
		os.Getenv("MARIADB_USER"),
		os.Getenv("MARIADB_PASSWORD"),
		os.Getenv("MARIADB_HOST"),
		port,
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

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	if err = ensureItemsAllowDirectShopPurchase(ctx, pool); err != nil {
		log.Fatalf("Failed to ensure items.allow_direct_shop_purchase (required for marketplace catalog): %v", err)
	}
	if err = ensureCasesCatalogVIPOnlyColumn(ctx, pool); err != nil {
		log.Fatalf("Failed to ensure cases_catalog.vip_only (required for GET /cases): %v", err)
	}
	if err = ensureMinigameServerCcuTable(ctx, pool); err != nil {
		log.Fatalf("Failed to ensure minigame_server_ccu table: %v", err)
	}

	log.Println("Connected to MariaDB")
}

// ensureItemsAllowDirectShopPurchase adds items.allow_direct_shop_purchase if missing (same as migration 005).
// Deploys that skip migration files still get a working catalog instead of HTTP 500 on marketplace reads.
func ensureItemsAllowDirectShopPurchase(ctx context.Context, db *sql.DB) error {
	var n int
	err := db.QueryRowContext(ctx, `
SELECT COUNT(*) FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'items' AND COLUMN_NAME = 'allow_direct_shop_purchase'
`).Scan(&n)
	if err != nil {
		return fmt.Errorf("information_schema check: %w", err)
	}
	if n > 0 {
		return nil
	}
	_, err = db.ExecContext(ctx, `
ALTER TABLE items
  ADD COLUMN allow_direct_shop_purchase TINYINT(1) NOT NULL DEFAULT 1
`)
	if err != nil {
		return fmt.Errorf("ALTER TABLE items ADD allow_direct_shop_purchase: %w", err)
	}
	_, err = db.ExecContext(ctx, `
UPDATE items SET allow_direct_shop_purchase = 0 WHERE id IN (
  'starter_cap', 'lucky_shades', 'arcane_band', 'neon_chain', 'rogue_mask', 'royal_crown',
  'lava_horns', 'frost_blade', 'void_wings', 'storm_halo', 'celestial_orb', 'mythic_dragon'
)
`)
	if err != nil {
		return fmt.Errorf("UPDATE items allow_direct_shop_purchase for case-only rows: %w", err)
	}
	log.Println("Applied items.allow_direct_shop_purchase schema (was missing)")
	return nil
}

// ensureCasesCatalogVIPOnlyColumn adds cases_catalog.vip_only if missing (same as migration 008).
// Deploys that skip SQL migrations otherwise return 500 on GET /cases (unknown column vip_only).
func ensureCasesCatalogVIPOnlyColumn(ctx context.Context, db *sql.DB) error {
	var n int
	err := db.QueryRowContext(ctx, `
SELECT COUNT(*) FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cases_catalog' AND COLUMN_NAME = 'vip_only'
`).Scan(&n)
	if err != nil {
		return fmt.Errorf("information_schema cases_catalog.vip_only: %w", err)
	}
	if n > 0 {
		return nil
	}
	_, err = db.ExecContext(ctx, `
ALTER TABLE cases_catalog
  ADD COLUMN vip_only TINYINT(1) NOT NULL DEFAULT 0 AFTER dev_product
`)
	if err != nil {
		return fmt.Errorf("ALTER TABLE cases_catalog ADD vip_only: %w", err)
	}
	log.Println("Applied cases_catalog.vip_only column (was missing)")
	return nil
}

// ensureMinigameServerCcuTable creates minigame_server_ccu if missing (migration 007).
// Older game builds POST /statistics/minigames/ccu with upserts against this table.
func ensureMinigameServerCcuTable(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `
CREATE TABLE IF NOT EXISTS minigame_server_ccu (
    server_job_id VARCHAR(128) NOT NULL,
    mode VARCHAR(64) NOT NULL,
    player_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (server_job_id, mode),
    KEY idx_mode_updated (mode, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
	if err != nil {
		return fmt.Errorf("CREATE TABLE minigame_server_ccu: %w", err)
	}
	return nil
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

// BeginMariaDBTx starts a transaction on the shared pool (for jobs that need multi-statement atomicity).
func BeginMariaDBTx(ctx context.Context) (*sql.Tx, error) {
	if pool == nil {
		InitMariaDB()
	}
	return pool.BeginTx(ctx, nil)
}
