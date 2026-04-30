import { getPublicClient } from "../_supabase.js";

export async function onRequestGet({ params, env }) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=300", // appraisals are immutable; cache 5 min on edge
  };

  const { slug } = params;
  if (!slug) {
    return new Response(JSON.stringify({ error: "slug required" }), { status: 400, headers });
  }

  const db = getPublicClient(env);

  const { data: appraisal, error } = await db
    .from("appraisals")
    .select("id, slug, total_buy, total_sell, item_count, created_at, raw_input")
    .eq("slug", slug)
    .single();

  if (error || !appraisal) {
    return new Response(JSON.stringify({ error: "Appraisal not found" }), { status: 404, headers });
  }

  const { data: items } = await db
    .from("appraisal_items")
    .select("type_id, name, quantity, sell_each, buy_each, sell_total, buy_total, unknown")
    .eq("appraisal_id", appraisal.id)
    .order("sell_total", { ascending: false });

  return new Response(
    JSON.stringify({
      slug: appraisal.slug,
      totalBuy: appraisal.total_buy,
      totalSell: appraisal.total_sell,
      itemCount: appraisal.item_count,
      createdAt: appraisal.created_at,
      rawInput: appraisal.raw_input,
      items: (items ?? []).map((i) => ({
        typeID: i.type_id,
        name: i.name,
        quantity: i.quantity,
        sellEach: parseFloat(i.sell_each),
        buyEach: parseFloat(i.buy_each),
        sellTotal: parseFloat(i.sell_total),
        buyTotal: parseFloat(i.buy_total),
        unknown: i.unknown,
      })),
    }),
    { headers }
  );
}
