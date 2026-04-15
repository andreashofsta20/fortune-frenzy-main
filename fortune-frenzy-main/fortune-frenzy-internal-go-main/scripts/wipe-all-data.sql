-- Nuclear wipe: all application tables (users, inventory, catalog, history, settings rows, etc.).
-- Restores only minimal rows expected by the app: settings defaults, leaderboard_cache, minigame_stats.
-- After this, items / cases_catalog / case_battle_cases are EMPTY — run seeds (002–004) or the game has no catalog.
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE external_cash_change_requests;
TRUNCATE TABLE item_listings;
TRUNCATE TABLE item_copies;
TRUNCATE TABLE trades;
TRUNCATE TABLE past_coinflips;
TRUNCATE TABLE item_transfers;
TRUNCATE TABLE cash_changes;
TRUNCATE TABLE item_serials;
TRUNCATE TABLE users;
TRUNCATE TABLE items;
TRUNCATE TABLE cases_catalog;
TRUNCATE TABLE case_battle_cases;
TRUNCATE TABLE settings;
TRUNCATE TABLE leaderboard_cache;
TRUNCATE TABLE minigame_stats;
TRUNCATE TABLE minigame_server_ccu;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO settings (setting_key, setting_value) VALUES
    ('game_open', 'true'),
    ('paycheck', '25000'),
    ('polling_cooldown', '2'),
    ('dailywheel', '{"rewards":[{"id":"cash_small","type":"cash","value":"5000","chance":22},{"id":"cash_mid","type":"cash","value":"25000","chance":18},{"id":"cash_big","type":"cash","value":"100000","chance":10},{"id":"gems_small","type":"gems","value":"40","chance":17},{"id":"gems_big","type":"gems","value":"120","chance":12},{"id":"item_royal","type":"item","value":"royal_crown","chance":10},{"id":"item_void","type":"item","value":"void_wings","chance":7},{"id":"mystery","type":"mystery","value":"","chance":4}]}');

INSERT INTO leaderboard_cache (id, cash_leaderboard, value_leaderboard) VALUES (1, '[]', '[]');

INSERT INTO minigame_stats (mode) VALUES ('Coinflip'), ('Item Cases'), ('Case Battles'), ('Jackpot');
