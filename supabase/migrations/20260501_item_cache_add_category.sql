-- Add EVE category_id to item_cache for LP Store type filter chips
ALTER TABLE item_cache ADD COLUMN IF NOT EXISTS category_id integer;
