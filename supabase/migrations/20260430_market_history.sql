-- 7-day market history cache (per typeID, The Forge region only)
-- Source: ESI /markets/{region_id}/history/?type_id={type_id}
-- Used by the LP Store tab to render volume sparklines and detect trends.

CREATE TABLE market_history (
  type_id     INTEGER     PRIMARY KEY REFERENCES item_cache (type_id) ON DELETE CASCADE,
  history     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE market_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read market_history"
  ON market_history FOR SELECT TO anon USING (true);

CREATE POLICY "service write market_history"
  ON market_history FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_market_history_updated_at
  BEFORE UPDATE ON market_history
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
