-- Enforce uniqueness for non-empty copy_id (multiple legacy '' rows remain valid).
-- Run POST /maintenance/dedupe-item-copies (with master-key) first if upgrading from data with duplicate copy_ids.

ALTER TABLE item_copies
  ADD COLUMN copy_id_unique_key VARCHAR(64)
    GENERATED ALWAYS AS (NULLIF(copy_id, '')) VIRTUAL,
  ADD UNIQUE KEY uk_item_copies_copy_id_nonempty (copy_id_unique_key);
