-- Case-only catalog items: no quick-buy from item shop (cases + trading + resellers only).
ALTER TABLE items
  ADD COLUMN allow_direct_shop_purchase TINYINT(1) NOT NULL DEFAULT 1;

UPDATE items SET allow_direct_shop_purchase = 0 WHERE id IN (
  'starter_cap', 'lucky_shades', 'arcane_band', 'neon_chain', 'rogue_mask', 'royal_crown',
  'lava_horns', 'frost_blade', 'void_wings', 'storm_halo', 'celestial_orb', 'mythic_dragon'
);
