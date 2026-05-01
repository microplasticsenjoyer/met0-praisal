-- Clear stale LP offers so all corps re-fetch from ESI with correct data.
-- Previous code versions may have cached offers with wrong corporation_id associations.
TRUNCATE TABLE lp_offers;
