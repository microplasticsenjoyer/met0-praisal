import { getServiceClient } from "../_supabase.js";
import { isSupportedCorp, isWrongFactionItem, LP_CORPS } from "./_corps.js";

const ESI_BASE = "https://esi.evetech.net/latest";
const FUZZWORK_BASE = "https://market.fuzzwork.co.uk/aggregates/";
const JITA_STATION = 60003760;
const OFFERS_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PRICE_TTL_MS = 30 * 60 * 1000;

export async function onRequestGet({ params, env }) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=300",
  };

  try {
    const corpId = parseInt(params.corpId, 10);
    if (!corpId || !isSupportedCorp(corpId)) {
      return new Response(JSON.stringify({ error: "Unsupported corporation" }), { status: 400, headers });
    }

    const db = getServiceClient(env);

    const { offers, updatedAt: offersUpdatedAt } = await getOffers(db, corpId);
    if (offers.length === 0) {
      return new Response(
        JSON.stringify({ corpId, corp: LP_CORPS[corpId], offers: [], offersUpdatedAt, pricesUpdatedAt: null }),
        { headers }
      );
    }

    // Resolve product names first so we can drop cross-faction items ESI
    // sometimes returns (e.g. Federation Navy items in 24th Imperial Crusade).
    const productTypeIdsRaw = [...new Set(offers.map((o) => o.type_id))];
    const productNames = await resolveTypeNames(db, productTypeIdsRaw);
    const filteredOffers = offers.filter(
      (o) => !isWrongFactionItem(corpId, productNames[o.type_id])
    );

    if (filteredOffers.length === 0) {
      return new Response(
        JSON.stringify({ corpId, corp: LP_CORPS[corpId], offers: [], offersUpdatedAt, pricesUpdatedAt: null }),
        { headers }
      );
    }

    // Now resolve input-material names for the kept offers.
    const inputTypeIds = new Set();
    for (const o of filteredOffers) {
      for (const r of o.required_items ?? []) inputTypeIds.add(r.type_id);
    }
    const inputNames = await resolveTypeNames(db, [...inputTypeIds]);
    const nameMap = { ...productNames, ...inputNames };

    const productTypeIds = [...new Set(filteredOffers.map((o) => o.type_id))];
    const allTypeIds = [...new Set([...productTypeIds, ...inputTypeIds])];
    const [{ priceMap, updatedAt: pricesUpdatedAt }, categoryMap] = await Promise.all([
      getPrices(db, allTypeIds),
      resolveTypeCategories(db, productTypeIds, nameMap),
    ]);

    const enriched = filteredOffers.map((o) => {
      const product = priceMap[o.type_id] ?? null;
      const productSell = product ? Number(product.sell_min) : 0;
      const productBuy = product ? Number(product.buy_max) : 0;
      const revenueSell = productSell * o.quantity;
      const revenueBuy = productBuy * o.quantity;

      let inputCost = Number(o.isk_cost);
      let inputsValid = true;
      const inputs = (o.required_items ?? []).map((r) => {
        const p = priceMap[r.type_id];
        const each = p ? Number(p.sell_min) : 0;
        if (!p) inputsValid = false;
        const total = each * r.quantity;
        inputCost += total;
        return {
          typeID: r.type_id,
          name: nameMap[r.type_id] ?? `Type ${r.type_id}`,
          quantity: r.quantity,
          sellEach: each,
          totalCost: total,
        };
      });

      const profitSell = revenueSell - inputCost;
      const profitBuy = revenueBuy - inputCost;
      const iskPerLpSell = o.lp_cost > 0 ? profitSell / o.lp_cost : 0;
      const iskPerLpBuy = o.lp_cost > 0 ? profitBuy / o.lp_cost : 0;

      return {
        offerId: o.offer_id,
        typeID: o.type_id,
        name: nameMap[o.type_id] ?? `Type ${o.type_id}`,
        quantity: o.quantity,
        lpCost: o.lp_cost,
        iskCost: Number(o.isk_cost),
        akCost: o.ak_cost,
        inputs,
        inputCost,
        productSell,
        productBuy,
        revenueSell,
        revenueBuy,
        profitSell,
        profitBuy,
        iskPerLpSell,
        iskPerLpBuy,
        sellVolume: product ? (product.sell_volume ?? null) : null,
        categoryId: categoryMap[o.type_id] ?? null,
        unknown: !product || !inputsValid,
      };
    });

    return new Response(
      JSON.stringify({ corpId, corp: LP_CORPS[corpId], offers: enriched, offersUpdatedAt, pricesUpdatedAt }),
      { headers }
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: err.message }),
      { status: 500, headers }
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getOffers(db, corpId) {
  const { data: cached } = await db
    .from("lp_offers")
    .select("offer_id, type_id, quantity, isk_cost, lp_cost, ak_cost, required_items, updated_at")
    .eq("corporation_id", corpId);

  const now = Date.now();
  const fresh = (cached ?? []).filter((r) => now - new Date(r.updated_at).getTime() < OFFERS_TTL_MS);
  if (fresh.length > 0) {
    const updatedAt = fresh.reduce(
      (min, r) => (r.updated_at < min ? r.updated_at : min),
      fresh[0].updated_at
    );
    return { offers: fresh, updatedAt };
  }

  const res = await fetch(`${ESI_BASE}/loyalty/stores/${corpId}/offers/?datasource=tranquility`, {
    headers: { "User-Agent": "met0-praisal/0.4.0" },
  });
  if (!res.ok) throw new Error(`ESI loyalty store fetch failed: ${res.status}`);
  const offers = await res.json();

  const updatedAt = new Date().toISOString();
  const rows = offers.map((o) => ({
    corporation_id: corpId,
    offer_id: o.offer_id,
    type_id: o.type_id,
    quantity: o.quantity,
    isk_cost: o.isk_cost,
    lp_cost: o.lp_cost,
    ak_cost: o.ak_cost ?? 0,
    required_items: o.required_items ?? [],
    updated_at: updatedAt,
  }));

  if (rows.length > 0) {
    // Delete before insert so stale rows from wrong corp associations are fully replaced.
    await db.from("lp_offers").delete().eq("corporation_id", corpId);
    await db.from("lp_offers").insert(rows);
  }
  return { offers: rows, updatedAt };
}

async function resolveTypeNames(db, typeIds) {
  if (typeIds.length === 0) return {};
  const { data: cached } = await db.from("item_cache").select("type_id, name").in("type_id", typeIds);

  const map = {};
  for (const row of cached ?? []) map[row.type_id] = row.name;

  const missing = typeIds.filter((id) => !(id in map));
  if (missing.length === 0) return map;

  const chunks = chunk(missing, 1000);
  const newRows = [];
  for (const c of chunks) {
    const res = await fetch(`${ESI_BASE}/universe/names/?datasource=tranquility`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "met0-praisal/0.4.0" },
      body: JSON.stringify(c),
    });
    if (!res.ok) continue;
    const data = await res.json();
    for (const item of data) {
      if (item.category === "inventory_type") {
        map[item.id] = item.name;
        newRows.push({
          type_id: item.id,
          name: item.name,
          name_lower: item.name.toLowerCase(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  if (newRows.length > 0) {
    await db.from("item_cache").upsert(newRows, { onConflict: "type_id" });
  }
  return map;
}

async function getPrices(db, typeIDs) {
  if (typeIDs.length === 0) return { priceMap: {}, updatedAt: null };

  const { data: cached } = await db
    .from("price_cache")
    .select("type_id, sell_min, sell_max, buy_min, buy_max, sell_volume, updated_at")
    .in("type_id", typeIDs);

  const priceMap = {};
  const stale = [];
  const now = Date.now();

  for (const row of cached ?? []) {
    if (now - new Date(row.updated_at).getTime() < PRICE_TTL_MS) {
      priceMap[row.type_id] = row;
    } else {
      stale.push(row.type_id);
    }
  }

  const missing = typeIDs.filter((id) => !(id in priceMap));
  const toFetch = [...new Set([...missing, ...stale])];

  if (toFetch.length > 0) {
    const freshTimestamp = new Date().toISOString();
    const fresh = await fuzzworkPrices(toFetch);
    const upsertRows = [];
    for (const [idStr, data] of Object.entries(fresh)) {
      const typeID = parseInt(idStr, 10);
      const row = {
        type_id: typeID,
        sell_min: parseFloat(data.sell.min),
        sell_max: parseFloat(data.sell.max),
        buy_min: parseFloat(data.buy.min),
        buy_max: parseFloat(data.buy.max),
        sell_volume: parseInt(data.sell.volume, 10) || null,
        updated_at: freshTimestamp,
      };
      priceMap[typeID] = row;
      upsertRows.push(row);
    }
    if (upsertRows.length > 0) {
      await db.from("price_cache").upsert(upsertRows, { onConflict: "type_id" });
    }
  }

  // Return the oldest timestamp so the UI shows a conservative freshness indicator.
  const updatedAt = Object.values(priceMap).reduce(
    (min, r) => (!min || r.updated_at < min ? r.updated_at : min),
    null
  );

  return { priceMap, updatedAt: updatedAt ?? new Date().toISOString() };
}

async function fuzzworkPrices(typeIDs) {
  const chunks = chunk(typeIDs, 200);
  const out = {};
  for (const c of chunks) {
    const params = new URLSearchParams({ station: JITA_STATION, types: c.join(",") });
    const res = await fetch(`${FUZZWORK_BASE}?${params}`);
    if (!res.ok) continue;
    Object.assign(out, await res.json());
  }
  return out;
}

// Each uncached type costs 2 ESI subrequests (type info + group info).
// Baseline ops (~12 subrequests) + 2*N must stay under Cloudflare's 50 limit.
const CATEGORY_FETCH_CONCURRENCY = 5;
const MAX_CATEGORY_TYPES = 15;

async function resolveTypeCategories(db, typeIds, nameMap) {
  if (typeIds.length === 0) return {};

  const { data: cached } = await db
    .from("item_cache")
    .select("type_id, category_id")
    .in("type_id", typeIds)
    .not("category_id", "is", null);

  const catMap = {};
  for (const row of cached ?? []) catMap[row.type_id] = row.category_id;

  // Cap total ESI fetches: remaining types get null categories and are resolved on future requests.
  const missing = typeIds.filter((id) => !(id in catMap)).slice(0, MAX_CATEGORY_TYPES);
  if (missing.length === 0) return catMap;

  // Fetch group_id for each missing type with bounded concurrency.
  const typeInfos = [];
  let tCursor = 0;
  async function typeWorker() {
    while (tCursor < missing.length) {
      const id = missing[tCursor++];
      try {
        const r = await fetch(`${ESI_BASE}/universe/types/${id}/?datasource=tranquility`, {
          headers: { "User-Agent": "met0-praisal/0.4.0" },
        });
        if (!r.ok) continue;
        const d = await r.json();
        if (d.group_id != null) typeInfos.push({ typeID: id, groupId: d.group_id });
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: Math.min(CATEGORY_FETCH_CONCURRENCY, missing.length) }, typeWorker));

  if (typeInfos.length === 0) return catMap;

  // Resolve each unique group_id → category_id with bounded concurrency.
  const uniqueGroups = [...new Set(typeInfos.map((t) => t.groupId))];
  const groupCats = {};
  let gCursor = 0;
  async function groupWorker() {
    while (gCursor < uniqueGroups.length) {
      const gid = uniqueGroups[gCursor++];
      try {
        const r = await fetch(`${ESI_BASE}/universe/groups/${gid}/?datasource=tranquility`, {
          headers: { "User-Agent": "met0-praisal/0.4.0" },
        });
        if (!r.ok) continue;
        const d = await r.json();
        if (d.category_id != null) groupCats[gid] = d.category_id;
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: Math.min(CATEGORY_FETCH_CONCURRENCY, uniqueGroups.length) }, groupWorker));

  const toCache = [];
  for (const { typeID, groupId } of typeInfos) {
    const catId = groupCats[groupId];
    if (catId != null) {
      catMap[typeID] = catId;
      toCache.push({ type_id: typeID, category_id: catId });
    }
  }
  if (toCache.length > 0) {
    // Single upsert instead of N individual updates.
    const now = new Date().toISOString();
    await db.from("item_cache").upsert(
      toCache.map(({ type_id, category_id }) => ({
        type_id,
        name: nameMap[type_id] ?? `Type ${type_id}`,
        name_lower: (nameMap[type_id] ?? `Type ${type_id}`).toLowerCase(),
        category_id,
        updated_at: now,
      })),
      { onConflict: "type_id" }
    );
  }
  return catMap;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
