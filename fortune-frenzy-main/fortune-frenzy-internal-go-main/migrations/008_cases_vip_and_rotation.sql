-- VIP-only item cases + daily rotation support (vip_only; next_rotation may be NULL until worker runs)

ALTER TABLE cases_catalog
  ADD COLUMN vip_only TINYINT(1) NOT NULL DEFAULT 0 AFTER dev_product;

-- Two tiers above the public Mythic case (VIP subscription required in game + API).
INSERT IGNORE INTO cases_catalog (id, name, price, items, ui_primary, ui_colour, min_value, max_value, available_for_gems, dev_product, vip_only, next_rotation) VALUES
('vip_elite', 'VIP Elite Case', 0,
 '[{"id":"void_wings","chance":40,"claimed":0},{"id":"storm_halo","chance":30,"claimed":0},{"id":"celestial_orb","chance":20,"claimed":0},{"id":"mythic_dragon","chance":10,"claimed":0}]',
 'rbxassetid://88579616548700', '#eab308', 140000, 1000000, FALSE, '', TRUE, NULL),
('vip_apex', 'VIP Apex Case', 0,
 '[{"id":"lava_horns","chance":40,"claimed":0},{"id":"frost_blade","chance":30,"claimed":0},{"id":"void_wings","chance":20,"claimed":0},{"id":"storm_halo","chance":10,"claimed":0}]',
 'rbxassetid://78562763263294', '#f59e0b', 42000, 260000, FALSE, '', TRUE, NULL);
