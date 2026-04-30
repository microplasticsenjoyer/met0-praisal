import fetch from "node-fetch";

const ESI_BASE = "https://esi.evetech.net/latest";
const USER_AGENT = process.env.ESI_USER_AGENT || "met0-praisal/0.1.0";

/**
 * Resolve an array of item name strings to typeIDs via ESI.
 * Returns a map: { "Tritanium": 34, "Unknown Item": null, ... }
 */
export async function resolveNames(names) {
  if (names.length === 0) return {};

  // ESI /universe/ids/ accepts up to 500 names per call
  const chunks = chunkArray(names, 500);
  const result = {};

  for (const chunk of chunks) {
    const res = await fetch(`${ESI_BASE}/universe/ids/?datasource=tranquility`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(chunk),
    });

    if (!res.ok) {
      console.error(`ESI /universe/ids/ error: ${res.status}`);
      chunk.forEach((n) => (result[n] = null));
      continue;
    }

    const data = await res.json();
    const resolved = {};
    for (const item of data.inventory_types ?? []) {
      resolved[item.name.toLowerCase()] = item.id;
    }

    for (const name of chunk) {
      result[name] = resolved[name.toLowerCase()] ?? null;
    }
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
