-- LP store offers cache (per pirate FW corp)
-- Refreshed every 24h from ESI /loyalty/stores/{corp_id}/offers/

CREATE TABLE lp_offers (
  corporation_id  INTEGER     NOT NULL,
  offer_id        INTEGER     NOT NULL,
  type_id         INTEGER     NOT NULL,
  quantity        INTEGER     NOT NULL DEFAULT 1,
  isk_cost        BIGINT      NOT NULL DEFAULT 0,
  lp_cost         INTEGER     NOT NULL,
  ak_cost         INTEGER     NOT NULL DEFAULT 0,
  required_items  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (corporation_id, offer_id)
);

CREATE INDEX idx_lp_offers_corp ON lp_offers (corporation_id);

ALTER TABLE lp_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read lp_offers"
  ON lp_offers FOR SELECT TO anon USING (true);

CREATE POLICY "service write lp_offers"
  ON lp_offers FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_lp_offers_updated_at
  BEFORE UPDATE ON lp_offers
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
