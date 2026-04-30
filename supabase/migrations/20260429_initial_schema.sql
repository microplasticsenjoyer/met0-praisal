-- met0-praisal initial schema
-- Applied to project: xvmpasymvtdghgobflgz (met0-praisal)
-- Run via: supabase db push  (or already applied via MCP)

CREATE TABLE item_cache (
  type_id     INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL UNIQUE,
  name_lower  TEXT    NOT NULL UNIQUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_item_cache_name_lower ON item_cache (name_lower);

CREATE TABLE price_cache (
  type_id     INTEGER PRIMARY KEY REFERENCES item_cache (type_id) ON DELETE CASCADE,
  sell_min    NUMERIC(20, 2) NOT NULL DEFAULT 0,
  sell_max    NUMERIC(20, 2) NOT NULL DEFAULT 0,
  buy_min     NUMERIC(20, 2) NOT NULL DEFAULT 0,
  buy_max     NUMERIC(20, 2) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE appraisals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        NOT NULL UNIQUE,
  raw_input   TEXT        NOT NULL,
  total_buy   NUMERIC(20, 2) NOT NULL DEFAULT 0,
  total_sell  NUMERIC(20, 2) NOT NULL DEFAULT 0,
  item_count  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appraisals_slug ON appraisals (slug);
CREATE INDEX idx_appraisals_created_at ON appraisals (created_at DESC);

CREATE TABLE appraisal_items (
  id            BIGSERIAL   PRIMARY KEY,
  appraisal_id  UUID        NOT NULL REFERENCES appraisals (id) ON DELETE CASCADE,
  type_id       INTEGER,
  name          TEXT        NOT NULL,
  quantity      INTEGER     NOT NULL DEFAULT 1,
  sell_each     NUMERIC(20, 2) NOT NULL DEFAULT 0,
  buy_each      NUMERIC(20, 2) NOT NULL DEFAULT 0,
  sell_total    NUMERIC(20, 2) NOT NULL DEFAULT 0,
  buy_total     NUMERIC(20, 2) NOT NULL DEFAULT 0,
  unknown       BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_appraisal_items_appraisal_id ON appraisal_items (appraisal_id);

ALTER TABLE item_cache      ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_cache     ENABLE ROW LEVEL SECURITY;
ALTER TABLE appraisals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE appraisal_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read item_cache"      ON item_cache      FOR SELECT TO anon USING (true);
CREATE POLICY "public read price_cache"     ON price_cache     FOR SELECT TO anon USING (true);
CREATE POLICY "public read appraisals"      ON appraisals      FOR SELECT TO anon USING (true);
CREATE POLICY "public read appraisal_items" ON appraisal_items FOR SELECT TO anon USING (true);

CREATE POLICY "service write item_cache"      ON item_cache      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service write price_cache"     ON price_cache     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service write appraisals"      ON appraisals      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service write appraisal_items" ON appraisal_items FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_item_cache_updated_at  BEFORE UPDATE ON item_cache  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_price_cache_updated_at BEFORE UPDATE ON price_cache FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
