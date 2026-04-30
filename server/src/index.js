import "dotenv/config";
import express from "express";
import cors from "cors";
import { resolveNames } from "./esi.js";
import { getPrices } from "./market.js";
import { parseItemList } from "./parser.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => res.json({ ok: true, version: "0.1.0" }));

/**
 * POST /appraise
 * Body: { text: string }
 * Returns: { items: AppraisedItem[], totalBuy: number, totalSell: number }
 */
app.post("/appraise", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text field required" });
    }

    // 1. Parse raw paste into { name, quantity } pairs
    const parsed = parseItemList(text);
    if (parsed.length === 0) {
      return res.status(400).json({ error: "No recognizable items found" });
    }

    // 2. Resolve names → typeIDs via ESI
    const names = [...new Set(parsed.map((i) => i.name))];
    const nameMap = await resolveNames(names); // { "Tritanium": 34, ... }

    // 3. Fetch Jita 4-4 prices from Fuzzwork
    const typeIDs = Object.values(nameMap).filter(Boolean);
    const priceMap = await getPrices(typeIDs); // { 34: { buy: {...}, sell: {...} } }

    // 4. Build response
    let totalBuy = 0;
    let totalSell = 0;

    const items = parsed.map(({ name, quantity }) => {
      const typeID = nameMap[name] ?? null;
      const prices = typeID ? priceMap[typeID] : null;

      const buyEach = prices ? parseFloat(prices.buy.max) : 0;
      const sellEach = prices ? parseFloat(prices.sell.min) : 0;
      const buyTotal = buyEach * quantity;
      const sellTotal = sellEach * quantity;

      totalBuy += buyTotal;
      totalSell += sellTotal;

      return {
        name,
        typeID,
        quantity,
        buyEach,
        sellEach,
        buyTotal,
        sellTotal,
        unknown: !typeID || !prices,
      };
    });

    res.json({ items, totalBuy, totalSell });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error", detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`met0-praisal server v0.1.0 listening on :${PORT}`);
});
