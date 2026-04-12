-- Fortune Frenzy Database Schema

CREATE TABLE IF NOT EXISTS items (
    id VARCHAR(128) PRIMARY KEY,
    asset_id VARCHAR(64) NOT NULL DEFAULT '',
    name VARCHAR(256) NOT NULL,
    creator VARCHAR(128) NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    average_price BIGINT NOT NULL DEFAULT 0,
    total_unboxed BIGINT NOT NULL DEFAULT 0,
    maximum_copies BIGINT NOT NULL DEFAULT 0,
    value BIGINT NOT NULL DEFAULT 0,
    color VARCHAR(16) NOT NULL DEFAULT '#ffffff',
    category VARCHAR(64) NOT NULL DEFAULT 'default',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_items_value (value),
    INDEX idx_items_asset_id (asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT PRIMARY KEY,
    name VARCHAR(64) NOT NULL DEFAULT '',
    display_name VARCHAR(64) NOT NULL DEFAULT '',
    country VARCHAR(8) NOT NULL DEFAULT '',
    current_cash BIGINT NOT NULL DEFAULT 0,
    current_value BIGINT NOT NULL DEFAULT 0,
    total_cash_earned BIGINT NOT NULL DEFAULT 0,
    total_cash_spent BIGINT NOT NULL DEFAULT 0,
    win_rate DOUBLE NOT NULL DEFAULT 0,
    biggest_win BIGINT NOT NULL DEFAULT 0,
    total_plays INT NOT NULL DEFAULT 0,
    favourite_mode VARCHAR(32) NOT NULL DEFAULT '',
    time_played BIGINT NOT NULL DEFAULT 0,
    xp BIGINT NOT NULL DEFAULT 0,
    recent_activity JSON DEFAULT NULL,
    last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_cash (current_cash DESC),
    INDEX idx_users_value (current_value DESC),
    FULLTEXT idx_users_name (name, display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS item_copies (
    user_asset_id VARCHAR(64) PRIMARY KEY,
    item_id VARCHAR(128) NOT NULL,
    owner_id BIGINT NOT NULL,
    serial_number INT NOT NULL DEFAULT 0,
    copy_id VARCHAR(64) NOT NULL DEFAULT '',
    acquired_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_copies_owner (owner_id),
    INDEX idx_copies_item (item_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS item_listings (
    user_asset_id VARCHAR(64) PRIMARY KEY,
    item_id VARCHAR(128) NOT NULL,
    seller_id BIGINT NOT NULL,
    price BIGINT NOT NULL,
    currency VARCHAR(16) NOT NULL DEFAULT 'cash',
    listed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_listings_item (item_id),
    INDEX idx_listings_seller (seller_id),
    FOREIGN KEY (user_asset_id) REFERENCES item_copies(user_asset_id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS past_coinflips (
    auto_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    id VARCHAR(64) NOT NULL UNIQUE,
    player1_id VARCHAR(32) NOT NULL,
    player2_id VARCHAR(32),
    player1_items TEXT,
    player2_items TEXT,
    status VARCHAR(32) NOT NULL,
    type VARCHAR(16) NOT NULL DEFAULT 'global',
    server_id VARCHAR(128) NOT NULL DEFAULT '',
    player1_coin INT NOT NULL DEFAULT 1,
    winning_coin INT,
    transfer_id VARCHAR(128) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_coinflips_players (player1_id, player2_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS trades (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    initiator_id BIGINT NOT NULL,
    receiver_id BIGINT NOT NULL,
    initiator_items JSON NOT NULL,
    receiver_items JSON NOT NULL,
    status ENUM('pending', 'accepted', 'declined', 'cancelled', 'failed') NOT NULL DEFAULT 'pending',
    transfer_id VARCHAR(128) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_trades_initiator (initiator_id),
    INDEX idx_trades_receiver (receiver_id),
    INDEX idx_trades_status (status),
    FOREIGN KEY (initiator_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cases_catalog (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(256) NOT NULL DEFAULT '',
    price BIGINT NOT NULL DEFAULT 0,
    items JSON NOT NULL,
    ui_primary VARCHAR(256) NOT NULL DEFAULT '',
    ui_colour VARCHAR(16) NOT NULL DEFAULT '#ffffff',
    next_rotation TIMESTAMP NULL DEFAULT NULL,
    opened_count BIGINT NOT NULL DEFAULT 0,
    min_value BIGINT NOT NULL DEFAULT 0,
    max_value BIGINT NOT NULL DEFAULT 0,
    available_for_gems BOOLEAN NOT NULL DEFAULT FALSE,
    dev_product VARCHAR(128) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS case_battle_cases (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(256) NOT NULL DEFAULT '',
    slug VARCHAR(256) NOT NULL DEFAULT '',
    image VARCHAR(512) NOT NULL DEFAULT '',
    price BIGINT NOT NULL DEFAULT 0,
    total_opened BIGINT NOT NULL DEFAULT 0,
    items JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cash_changes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    amount BIGINT NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cashchanges_user (user_id, consumed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(128) PRIMARY KEY,
    setting_value JSON NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO settings (setting_key, setting_value) VALUES
    ('game_open', 'true'),
    ('paycheck', '25000'),
    ('polling_cooldown', '2'),
    ('dailywheel', '{"rewards":[{"type":"cash","value":"50000","chance":30,"id":"cash_50k"},{"type":"cash","value":"100000","chance":20,"id":"cash_100k"},{"type":"gems","value":"50","chance":25,"id":"gems_50"},{"type":"gems","value":"100","chance":15,"id":"gems_100"},{"type":"mystery","value":"","chance":10,"id":"mystery"}]}');

CREATE TABLE IF NOT EXISTS item_serials (
    item_id VARCHAR(128) PRIMARY KEY,
    next_serial INT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS item_transfers (
    transfer_id VARCHAR(128) PRIMARY KEY,
    transfer_data JSON NOT NULL,
    status ENUM('pending', 'confirmed', 'cancelled') NOT NULL DEFAULT 'pending',
    winner_id VARCHAR(32) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_transfers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS leaderboard_cache (
    id INT PRIMARY KEY DEFAULT 1,
    cash_leaderboard JSON NOT NULL DEFAULT '[]',
    value_leaderboard JSON NOT NULL DEFAULT '[]',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO leaderboard_cache (id, cash_leaderboard, value_leaderboard) VALUES (1, '[]', '[]');

CREATE TABLE IF NOT EXISTS minigame_stats (
    mode VARCHAR(64) PRIMARY KEY,
    current_ccu INT NOT NULL DEFAULT 0,
    total_spent BIGINT NOT NULL DEFAULT 0,
    total_games_played BIGINT NOT NULL DEFAULT 0,
    total_wins BIGINT NOT NULL DEFAULT 0,
    total_losses BIGINT NOT NULL DEFAULT 0,
    last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO minigame_stats (mode) VALUES ('Coinflip'), ('Item Cases'), ('Case Battles'), ('Jackpot');
