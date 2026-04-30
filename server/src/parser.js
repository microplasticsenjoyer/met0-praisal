/**
 * Parse raw EVE item paste into structured { name, quantity } pairs.
 *
 * Supports formats:
 *   - "Tritanium"                      → qty 1
 *   - "Tritanium x1000"                → qty 1000
 *   - "1000 Tritanium"                 → qty 1000
 *   - "Tritanium\t1,000"               → qty 1000  (cargo scan / contract)
 *   - "1,000\tTritanium"               → qty 1000
 *   - Lines starting with # or // are ignored (comments)
 */
export function parseItemList(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"));

  const items = [];

  for (const line of lines) {
    const result = parseLine(line);
    if (result) items.push(result);
  }

  // Merge duplicate names by summing quantities
  const merged = {};
  for (const { name, quantity } of items) {
    const key = name.toLowerCase();
    if (merged[key]) {
      merged[key].quantity += quantity;
    } else {
      merged[key] = { name, quantity };
    }
  }

  return Object.values(merged);
}

function parseLine(line) {
  // Normalize commas in numbers and collapse whitespace
  const normalized = line.replace(/,/g, "");

  // Format: "Name\tQty" or "Qty\tName" (tab-separated — cargo scan / contracts)
  if (normalized.includes("\t")) {
    const parts = normalized.split("\t").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0];
      const second = parts[1];
      if (/^\d+$/.test(first)) {
        return { name: cleanName(second), quantity: parseInt(first, 10) };
      }
      if (/^\d+$/.test(second)) {
        return { name: cleanName(first), quantity: parseInt(second, 10) };
      }
      // No clear number, treat first as name
      return { name: cleanName(first), quantity: 1 };
    }
  }

  // Format: "Name x Qty" or "Name xQty"
  const xMatch = normalized.match(/^(.+?)\s*[xX]\s*(\d+)\s*$/);
  if (xMatch) {
    return { name: cleanName(xMatch[1]), quantity: parseInt(xMatch[2], 10) };
  }

  // Format: "Qty Name"
  const qtyFirstMatch = normalized.match(/^(\d+)\s+(.+)$/);
  if (qtyFirstMatch) {
    return { name: cleanName(qtyFirstMatch[2]), quantity: parseInt(qtyFirstMatch[1], 10) };
  }

  // Plain name, quantity 1
  const name = cleanName(normalized);
  if (name.length > 0) {
    return { name, quantity: 1 };
  }

  return null;
}

function cleanName(str) {
  return str
    .replace(/\*$/, "")    // remove trailing asterisk (contracts)
    .replace(/\s+/g, " ")  // collapse spaces
    .trim();
}
