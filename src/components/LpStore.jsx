import React, { useEffect, useState, useMemo, useRef } from "react";
import styles from "./LpStore.module.css";
import Sparkline from "./Sparkline.jsx";

const CORP_GROUPS = [
  {
    label: "Main FW Militias",
    corps: [
      { id: 1000110, name: "24th Imperial Crusade", faction: "Amarr Empire" },
      { id: 1000179, name: "Federal Defence Union", faction: "Gallente Federation" },
      { id: 1000180, name: "State Protectorate", faction: "Caldari State" },
      { id: 1000182, name: "Tribal Liberation Force", faction: "Minmatar Republic" },
    ],
  },
  {
    label: "Pirate FW",
    corps: [
      { id: 1000436, name: "Malakim Zealots", faction: "Angel Cartel" },
      { id: 1000437, name: "Commando Guri", faction: "Guristas Pirates" },
    ],
  },
];

const ALL_CORPS = CORP_GROUPS.flatMap((g) => g.corps);

function fmt(v) {
  if (v === 0) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + "k";
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtIskPerLp(v) {
  if (!isFinite(v) || v === 0) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function timeAgo(isoString) {
  if (!isoString) return "–";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Bucket a value (`v`) against a sorted reference array using a 4-tier scale.
// Used to color SELL VOL relative to peers in the same corp's offer set.
function volumeTier(v, sortedAll) {
  if (v == null || sortedAll.length === 0) return null;
  const n = sortedAll.length;
  const idx = lowerBound(sortedAll, v);
  const pct = idx / n;
  if (pct < 0.25) return "low";
  if (pct < 0.5) return "midLow";
  if (pct < 0.75) return "midHigh";
  return "high";
}

const STORAGE_PREFIX = "met0:lpStore:";
function readStored(key) {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key) ?? "0";
  } catch {
    return "0";
  }
}
function parseStored(key) {
  return Math.max(0, parseFloat(readStored(key)) || 0);
}
function writeStored(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, String(value ?? ""));
  } catch {
    /* storage unavailable — ignore */
  }
}

function lowerBound(arr, target) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export default function LpStore() {
  const [corpId, setCorpId] = useState(ALL_CORPS[0].id);
  const [data, setData] = useState(null);
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState("iskPerLpSell");
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");
  const [advanced, setAdvanced] = useState(() => window.innerWidth >= 768);

  // Draft strings (what the user types) — applied on Calculate.
  // Hydrated from localStorage so values survive a page refresh.
  const [draftLpPrice, setDraftLpPrice] = useState(() => readStored("lpPrice"));
  const [draftSalesTax, setDraftSalesTax] = useState(() => readStored("salesTax"));
  const [draftMfgTax, setDraftMfgTax] = useState(() => readStored("mfgTax"));

  // Applied values used for computation. Initialised from the stored drafts so
  // the table renders with the user's last-used inputs on first paint.
  const [lpPrice, setLpPrice] = useState(() => parseStored("lpPrice"));
  const [salesTax, setSalesTax] = useState(() => parseStored("salesTax"));
  const [mfgTax, setMfgTax] = useState(() => parseStored("mfgTax"));

  const historyAbortRef = useRef(null);

  function handleCalculate() {
    const lp = Math.max(0, parseFloat(draftLpPrice) || 0);
    const st = Math.max(0, parseFloat(draftSalesTax) || 0);
    const mt = Math.max(0, parseFloat(draftMfgTax) || 0);
    setLpPrice(lp);
    setSalesTax(st);
    setMfgTax(mt);
    writeStored("lpPrice", draftLpPrice);
    writeStored("salesTax", draftSalesTax);
    writeStored("mfgTax", draftMfgTax);
  }

  function draftInput(value, setter) {
    return (
      <input
        type="text"
        inputMode="decimal"
        className={styles.numInput}
        value={value}
        placeholder="0"
        onChange={(e) => setter(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === "Enter") handleCalculate(); }}
      />
    );
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setData(null);
      setHistory({});
      try {
        const res = await fetch(`/api/lp/${corpId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Request failed");
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [corpId]);

  // Background fetch: 7-day volume history for every product type in the
  // current offer set. Cancelled if the user switches corp before it returns.
  useEffect(() => {
    if (!data?.offers?.length) return;
    const typeIds = [...new Set(data.offers.map((o) => o.typeID))];
    const controller = new AbortController();
    historyAbortRef.current?.abort();
    historyAbortRef.current = controller;

    fetch("/api/lp/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typeIds }),
      signal: controller.signal,
    })
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (j?.history) setHistory(j.history); })
      .catch(() => { /* aborted or network error — silent */ });

    return () => controller.abort();
  }, [data]);

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }
  const arrow = (key) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  // Apply profit adjustments on top of the raw API data.
  const adjustedOffers = useMemo(() => {
    if (!data?.offers) return [];
    return data.offers.map((o) => {
      const materialCost = o.inputCost - o.iskCost;
      const adjMaterialCost = materialCost * (1 + mfgTax / 100);
      const adjTotalCost = o.iskCost + adjMaterialCost + o.lpCost * lpPrice;
      const adjRevenueSell = o.productSell * o.quantity * (1 - salesTax / 100);
      const adjProfitSell = adjRevenueSell - adjTotalCost;
      const adjProfitBuy = o.productBuy * o.quantity - adjTotalCost;
      return {
        ...o,
        adjMaterialCost,
        revenueSell: adjRevenueSell,
        profitSell: adjProfitSell,
        profitBuy: adjProfitBuy,
        iskPerLpSell: o.lpCost > 0 ? adjProfitSell / o.lpCost : 0,
        iskPerLpBuy: o.lpCost > 0 ? adjProfitBuy / o.lpCost : 0,
      };
    });
  }, [data, lpPrice, salesTax, mfgTax]);

  // Sorted reference of all non-null sell volumes for color tiering.
  const sortedVolumes = useMemo(() => {
    return adjustedOffers
      .map((o) => o.sellVolume)
      .filter((v) => v != null && v > 0)
      .sort((a, b) => a - b);
  }, [adjustedOffers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return adjustedOffers;
    return adjustedOffers.filter((o) => o.name.toLowerCase().includes(q));
  }, [adjustedOffers, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      // Nulls always sink to the bottom regardless of sort direction
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  return (
    <>
      <div className={styles.controls}>
        {/* Group 1: corp selector + search filter */}
        <div className={styles.selectorGroup}>
          <div className={styles.field}>
            <label className={styles.label}>CORPORATION</label>
            <select
              className={styles.select}
              value={corpId}
              onChange={(e) => setCorpId(parseInt(e.target.value, 10))}
            >
              {CORP_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.corps.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.faction}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>FILTER</label>
            <input
              className={styles.search}
              type="text"
              placeholder="search item name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Group 2: tax inputs + calculate (always on same line) */}
        <div className={styles.taxGroup}>
          <div className={styles.field}>
            <label className={styles.label}>LP PRICE (ISK/LP)</label>
            {draftInput(draftLpPrice, setDraftLpPrice)}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>SALES TAX %</label>
            {draftInput(draftSalesTax, setDraftSalesTax)}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>MFG TAX %</label>
            {draftInput(draftMfgTax, setDraftMfgTax)}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>&nbsp;</label>
            <button className={styles.calcBtn} onClick={handleCalculate}>CALCULATE</button>
          </div>
        </div>
      </div>

      {loading && <div className={styles.loading}>FETCHING LP STORE...</div>}
      {error && <div className={styles.error}>⚠ {error}</div>}

      {data && !loading && (
        <>
          <div className={styles.tableToolbar}>
            <div className={styles.meta}>
              <div>{filtered.length} / {data.offers.length} offers</div>
              {data.offersUpdatedAt && (
                <div className={styles.cacheAge}>
                  offers {timeAgo(data.offersUpdatedAt)} · prices {timeAgo(data.pricesUpdatedAt)}
                </div>
              )}
            </div>
            <button
              className={styles.toggleBtn}
              onClick={() => setAdvanced((a) => !a)}
            >
              {advanced ? "SIMPLIFIED" : "ADVANCED"}
            </button>
          </div>
          <div className={styles.wrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thName} onClick={() => handleSort("name")}>ITEM{arrow("name")}</th>
                  {advanced && <th className={styles.thNum} onClick={() => handleSort("quantity")}>QTY{arrow("quantity")}</th>}
                  {advanced && <th className={styles.thNum} onClick={() => handleSort("lpCost")}>LP{arrow("lpCost")}</th>}
                  {advanced && <th className={styles.thNum} onClick={() => handleSort("iskCost")}>ISK COST{arrow("iskCost")}</th>}
                  {advanced && <th className={styles.thNum} onClick={() => handleSort("adjMaterialCost")}>INPUTS{arrow("adjMaterialCost")}</th>}
                  {advanced && <th className={styles.thNum} onClick={() => handleSort("sellVolume")}>SELL VOL{arrow("sellVolume")}</th>}
                  <th className={styles.thNum}>30D VOL</th>
                  {advanced && <th className={styles.thNum} onClick={() => handleSort("revenueSell")}>SELL VAL{arrow("revenueSell")}</th>}
                  {advanced && <th className={styles.thNum} onClick={() => handleSort("profitSell")}>PROFIT (SELL){arrow("profitSell")}</th>}
                  <th className={`${styles.thNum} ${styles.thHighlight}`} onClick={() => handleSort("iskPerLpSell")}>
                    ISK/LP (SELL){arrow("iskPerLpSell")}
                  </th>
                  <th className={styles.thNum} onClick={() => handleSort("iskPerLpBuy")}>ISK/LP (BUY){arrow("iskPerLpBuy")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((o) => {
                  const tier = volumeTier(o.sellVolume, sortedVolumes);
                  const volClass = tier ? styles[`vol_${tier}`] : "";
                  const h = history[o.typeID];
                  return (
                    <tr key={o.offerId} className={o.unknown ? styles.unknown : ""}>
                      <td className={styles.tdName}>
                        <a
                          href={`https://www.everef.net/type/${o.typeID}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.link}
                        >
                          {o.name}
                        </a>
                        {o.inputs.length > 0 && (
                          <div className={styles.inputs}>
                            {o.inputs.map((i) => (
                              <span key={i.typeID} className={styles.input}>
                                {i.quantity}× {i.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      {advanced && <td className={styles.tdNum}>{o.quantity.toLocaleString()}</td>}
                      {advanced && <td className={styles.tdNum}>{o.lpCost.toLocaleString()}</td>}
                      {advanced && <td className={styles.tdNum}>{fmt(o.iskCost)}</td>}
                      {advanced && <td className={styles.tdNum}>{fmt(o.adjMaterialCost)}</td>}
                      {advanced && (
                        <td className={`${styles.tdNum} ${volClass}`}>
                          {o.sellVolume != null ? fmt(o.sellVolume) : "—"}
                        </td>
                      )}
                      <td className={styles.tdSpark}>
                        <Sparkline values={h?.volume} />
                      </td>
                      {advanced && <td className={`${styles.tdNum} ${styles.sell}`}>{fmt(o.revenueSell)}</td>}
                      {advanced && (
                        <td className={`${styles.tdNum} ${o.profitSell >= 0 ? styles.sell : styles.danger}`}>
                          {fmt(o.profitSell)}
                        </td>
                      )}
                      <td className={`${styles.tdNum} ${styles.highlight} ${o.iskPerLpSell >= 0 ? styles.sell : styles.danger}`}>
                        {fmtIskPerLp(o.iskPerLpSell)}
                      </td>
                      <td className={`${styles.tdNum} ${o.iskPerLpBuy >= 0 ? styles.buy : styles.danger}`}>
                        {fmtIskPerLp(o.iskPerLpBuy)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
