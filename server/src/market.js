import fetch from "node-fetch";

// Jita 4-4 station ID
const JITA_STATION = 60003760;
const FUZZWORK_BASE = "https://market.fuzzwork.co.uk/aggregates/";

/**
 * Fetch Jita 4-4 buy/sell prices for an array of typeIDs.
 * Returns: { [typeID]: { buy: { max, min, ... }, sell: { max, min, ... } } }
 */
export async function getPrices(typeIDs) {
  if (typeIDs.length === 0) return {};

  // Fuzzwork accepts up to ~200 typeIDs per request
  const chunks = chunkArray(typeIDs, 200);
  const result = {};

  for (const chunk of chunks) {
    const params = new URLSearchParams({
      station: JITA_STATION,
      types: chunk.join(","),
    });

    const res = await fetch(`${FUZZWORK_BASE}?${params}`);
    if (!res.ok) {
      console.error(`Fuzzwork API error: ${res.status}`);
      continue;
    }

    const data = await res.json();
    Object.assign(result, data);
  }

  return result;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
