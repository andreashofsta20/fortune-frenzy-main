-- Per-Roblox-server heartbeats for global minigame "players active" counts.
CREATE TABLE IF NOT EXISTS minigame_server_ccu (
    server_job_id VARCHAR(128) NOT NULL,
    mode VARCHAR(64) NOT NULL,
    player_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (server_job_id, mode),
    KEY idx_mode_updated (mode, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
