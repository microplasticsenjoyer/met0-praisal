import { getServiceClient } from "./_supabase.js";
import { parseItemList } from "./_parser.js";
import { generateSlug } from "./_slug.js";

const ESI_BASE = "https://esi.evetech.net/latest";
const FUZZWORK_BASE = "https://market.fuzzwork.co.uk/aggregates/";
const JITA_STATION = 60003760;

// Price cache TTL: 15 minutes
const PRICE_TTL_MS = 15 * 60 * 1000;
// Item cache TTL: 7 days (typeIDs don't change often)
const ITEM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function onRequestPost({ request, env }) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const { text } = await request.json();
    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: "text field required" }), { status: 400, headers });
    }

    const db = getServiceClient(env);
    const parsed = parseItemList(text);
    if (parsed.length === 0) {
      return new Response(JSON.stringify({ error: "No recognizable items found" }), { status: 400, headers });
    }

    // ── 1. Resolve names → typeIDs (cache-first) ──────────────────────────
    const names = parsed.map((i) => i.name);
    const nameMap = await resolveNames(db, names);

    // ── 2. Fetch prices (cache-first) ─────────────────────────────────────
    const typeIDs = Object.values(nameMap).filter(Boolean);
    const priceMap = await getPrices(db, typeIDs);

    // ── 3. Build line items ───────────────────────────────────────────────
    let totalBuy = 0;
    let totalSell = 0;

    const items = parsed.map(({ name, quantity }) => {
      const typeID = nameMap[name.toLowerCase()] ?? null;
      const prices = typeID ? priceMap[typeID] : null;

      const sellEach = prices?.sell_min ?? 0;
      const buyEach = prices?.buy_max ?? 0;
      const sellTotal = sellEach * quantity;
      const buyTotal = buyEach * quantity;

      totalBuy += buyTotal;
      totalSell += sellTotal;

      return { typeID, name, quantity, sellEach, buyEach, sellTotal, buyTotal, unknown: !typeID || !prices };
    });

    // ── 4. Persist appraisal ──────────────────────────────────────────────
    const slug = await uniqueSlug(db);

    const { data: appraisal, error: appraisalErr } = await db
      .from("appraisals")
      .insert({ slug, raw_input: text, total_buy: totalBuy, total_sell: totalSell, item_count: items.length })
      .select("id, slug, created_at")
      .single();

    if (appraisalErr) throw appraisalErr;

    await db.from("appraisal_items").insert(
      items.map((item) => ({
        appraisal_id: appraisal.id,
        type_id: item.typeID,
        name: item.name,
        quantity: item.quantity,
        sell_each: item.sellEach,
        buy_each: item.buyEach,
        sell_total: item.sellTotal,
        buy_total: item.buyTotal,
        unknown: item.unknown,
      }))
    );

    return new Response(
      JSON.stringify({ slug: appraisal.slug, createdAt: appraisal.created_at, items, totalBuy, totalSell }),
      { headers }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal server error", detail: err.message }), { status: 500, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function resolveNames(db, names) {
  const lowerNames = names.map((n) => n.toLowerCase());

  // Check cache
  const { data: cached } = await db
    .from("item_cache")
    .select("name_lower, type_id, updated_at")
    .in("name_lower", lowerNames);

  const nameMap = {};
  const stale = [];
  const now = Date.now();

  for (const row of cached ?? []) {
    if (now - new Date(row.updated_at).getTime() < ITEM_TTL_MS) {
      nameMap[row.name_lower] = row.type_id;
    } else {
      stale.push(row.name_lower);
    }
  }

  const missing = lowerNames.filter((n) => !(n in nameMap));
  const toFetch = [...new Set([...missing, ...stale])];

  if (toFetch.length > 0) {
    // Map lowercase back to original casing for ESI
    const originalNames = names.filter((n) => toFetch.includes(n.toLowerCase()));
    const resolved = await esiResolveNames(originalNames);

    // Upsert into cache
    if (resolved.length > 0) {
      await db.from("item_cache").upsert(
        resolved.map((r) => ({ type_id: r.id, name: r.name, name_lower: r.name.toLowerCase(), updated_at: new Date().toISOString() })),
        { onConflict: "type_id" }
      );
      for (const r of resolved) nameMap[r.name.toLowerCase()] = r.id;
    }
  }

  // Build final map keyed by original name (case-insensitive)
  const result = {};
  for (const name of names) {
    result[name.toLowerCase()] = nameMap[name.toLowerCase()] ?? null;
  }
  return result;
}

async function esiResolveNames(names) {
  if (names.length === 0) return [];
  const chunks = chunk(names, 500);
  const out = [];
  for (const c of chunks) {
    const res = await fetch(`${ESI_BASE}/universe/ids/?datasource=tranquility`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "met0-praisal/0.1.0" },
      body: JSON.stringify(c),
    });
    if (!res.ok) continue;
    const data = await res.json();
    out.push(...(data.inventory_types ?? []));
  }
  return out;
}

async function getPrices(db, typeIDs) {
  if (typeIDs.length === 0) return {};

  // Check cache
  const { data: cached } = await db
    .from("price_cache")
    .select("type_id, sell_min, sell_max, buy_min, buy_max, updated_at")
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
        updated_at: new Date().toISOString(),
      };
      priceMap[typeID] = row;
      upsertRows.push(row);
    }

    if (upsertRows.length > 0) {
      await db.from("price_cache").upsert(upsertRows, { onConflict: "type_id" });
    }
  }

  return priceMap;
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

async function uniqueSlug(db) {
  for (let i = 0; i < 10; i++) {
    const slug = generateSlug(6);
    const { data } = await db.from("appraisals").select("slug").eq("slug", slug).maybeSingle();
    if (!data) return slug;
  }
  return generateSlug(8); // fallback to longer slug
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
