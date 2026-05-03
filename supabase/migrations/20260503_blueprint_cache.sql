-- Blueprint manufacturing-recipe cache.
-- Sourced from Fuzzwork's blueprint API, used to compute build cost +
-- built-product profitability for LP-store BPC offers (ships built from
-- blueprints sell for far more than the raw BPC).
--
-- Recipes change rarely (mostly when CCP rebalances industry), so a long
-- TTL is fine.

CREATE TABLE blueprint_cache (
  blueprint_type_id INTEGER     PRIMARY KEY,
  product_type_id   INTEGER     NOT NULL,
  product_quantity  INTEGER     NOT NULL DEFAULT 1,
  materials         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE blueprint_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read blueprint_cache"
  ON blueprint_cache FOR SELECT TO anon USING (true);

CREATE POLICY "service write blueprint_cache"
  ON blueprint_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_blueprint_cache_updated_at
  BEFORE UPDATE ON blueprint_cache
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
