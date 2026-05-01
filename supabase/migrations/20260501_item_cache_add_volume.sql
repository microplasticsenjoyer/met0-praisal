-- Add packaged volume (m³) to item_cache for appraisal cargo volume display
ALTER TABLE item_cache ADD COLUMN IF NOT EXISTS volume numeric;
