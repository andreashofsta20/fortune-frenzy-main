-- Fix settings with proper reward ids matching local-backend
DELETE FROM settings WHERE setting_key = 'dailywheel';
INSERT INTO settings (setting_key, setting_value) VALUES
    ('dailywheel', '{"rewards":[{"id":"cash_small","type":"cash","value":"5000","chance":22},{"id":"cash_mid","type":"cash","value":"25000","chance":18},{"id":"cash_big","type":"cash","value":"100000","chance":10},{"id":"gems_small","type":"gems","value":"40","chance":17},{"id":"gems_big","type":"gems","value":"120","chance":12},{"id":"item_royal","type":"item","value":"royal_crown","chance":10},{"id":"item_void","type":"item","value":"void_wings","chance":7},{"id":"mystery","type":"mystery","value":"","chance":4}]}');

-- Add external_cash_change_requests table (used by purchase_item handler)
CREATE TABLE IF NOT EXISTS external_cash_change_requests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    amount BIGINT NOT NULL,
    reason VARCHAR(256) NOT NULL DEFAULT 'marketplace_sale',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ecr_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
