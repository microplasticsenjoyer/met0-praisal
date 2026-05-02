import React, { useEffect, useState, useMemo, useRef } from "react";
import styles from "./LpStore.module.css";
import { useCorpGroups } from "../lib/corps.js";

// EVE category_id → friendly label for filter chips.
const CATEGORY_LABELS = {
  6: "Ships", 7: "Modules", 8: "Charges", 9: "Blueprints",
  16: "Skills", 17: "Commodities", 18: "Drones", 20: "Implants",
  22: "Deployables", 30: "Apparel", 32: "Subsystems", 65: "Structures",
};

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

// URL params live alongside ?tab=lp so deep-links keep working.
function readUrlParam(key) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}
function writeUrlParams(updates) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(updates)) {
    if (v == null || v === "") params.delete(k);
    else params.set(k, String(v));
  }
  const qs = params.toString();
  const url = qs ? `?${qs}` : window.location.pathname;
  window.history.replaceState({}, "", url);
}

export default function LpStore() {
  const { groups: CORP_GROUPS, allCorps: ALL_CORPS, loading: corpsLoading } = useCorpGroups();

  // Hydrate corp from URL (?corp=) if present and supported.
  const [corpId, setCorpId] = useState(() => {
    const fromUrl = parseInt(readUrlParam("corp") ?? "", 10);
    return Number.isFinite(fromUrl) ? fromUrl : null;
  });

  // Once corp list arrives, default to the first one if URL didn't pick.
  useEffect(() => {
    if (corpId != null) return;
    if (ALL_CORPS.length === 0) return;
    setCorpId(ALL_CORPS[0].id);
  }, [ALL_CORPS, corpId]);
  const [data, setData] = useState(null);
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sort state — persisted across page loads and corp switches.
  const [sortKey, setSortKey] = useState(
    () => localStorage.getItem(STORAGE_PREFIX + "sortKey") ?? "iskPerLpSell"
  );
  const [sortDir, setSortDir] = useState(
    () => localStorage.getItem(STORAGE_PREFIX + "sortDir") ?? "desc"
  );

  const [search, setSearch] = useState(() => readUrlParam("q") ?? "");
  const [categoryFilter, setCategoryFilter] = useState(() => {
    const c = parseInt(readUrlParam("cat") ?? "", 10);
    return Number.isFinite(c) ? c : null;
  });

  // Persist filter/search/corp to URL for deep-linking.
  useEffect(() => {
    writeUrlParams({
      corp: corpId,
      cat: categoryFilter,
      q: search.trim() || null,
    });
  }, [corpId, categoryFilter, search]);

  // Advanced toggle — persisted to localStorage; falls back to viewport width.
  const [advanced, setAdvanced] = useState(() => {
    const s = localStorage.getItem(STORAGE_PREFIX + "advanced");
    return s !== null ? s === "true" : window.innerWidth >= 768;
  });

  // Group-by-item: collapse duplicate products to best ISK/LP offer.
  const [groupByItem, setGroupByItem] = useState(false);

  // Copy-to-clipboard feedback: stores the offerId that was just copied.
  const [copied, setCopied] = useState(null);

  // Draft strings (what the user types) — applied on Calculate.
  const [draftLpPrice, setDraftLpPrice] = useState(() => readStored("lpPrice"));
  const [draftSalesTax, setDraftSalesTax] = useState(() => readStored("salesTax"));
  const [draftMfgTax, setDraftMfgTax] = useState(() => readStored("mfgTax"));

  // Applied values used for computation.
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
    if (corpId == null) return;
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

  // Background fetch: 30-day volume + price history for every product type.
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
    if (sortKey === key) {
      const next = sortDir === "asc" ? "desc" : "asc";
      setSortDir(next);
      writeStored("sortDir", next);
    } else {
      setSortKey(key);
      setSortDir("desc");
      writeStored("sortKey", key);
      writeStored("sortDir", "desc");
    }
  }

  function toggleAdvanced() {
    setAdvanced((a) => {
      writeStored("advanced", !a);
      return !a;
    });
  }

  const arrow = (key) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  // Step 1: apply profit adjustments on top of raw API data.
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

  // Step 2: merge history data — avgDailyVol, daysOfSupply, priceHistory.
  const withHistory = useMemo(() => {
    return adjustedOffers.map((o) => {
      const h = history[o.typeID];
      const vols = h?.volume?.filter((v) => v > 0) ?? [];
      const avgDailyVol = vols.length > 0
        ? Math.round(vols.reduce((s, v) => s + v, 0) / vols.length)
        : null;
      const daysOfSupply =
        o.sellVolume != null && avgDailyVol != null && avgDailyVol > 0
          ? Math.round(o.sellVolume / avgDailyVol)
          : null;
      return { ...o, avgDailyVol, daysOfSupply, priceHistory: h };
    });
  }, [adjustedOffers, history]);

  // Step 3: collapse duplicate products to best-ISK/LP offer when grouping.
  const offersForDisplay = useMemo(() => {
    if (!groupByItem) return withHistory;
    const counts = new Map();
    for (const o of withHistory) counts.set(o.typeID, (counts.get(o.typeID) ?? 0) + 1);
    const bestByType = new Map();
    for (const o of withHistory) {
      const cur = bestByType.get(o.typeID);
      if (!cur || o.iskPerLpSell > cur.iskPerLpSell) bestByType.set(o.typeID, o);
    }
    return [...bestByType.values()].map((o) => ({
      ...o,
      offerCount: counts.get(o.typeID) ?? 1,
    }));
  }, [withHistory, groupByItem]);

  // Sorted sell-volume references for colour tiering (relative to current display set).
  const sortedVolumes = useMemo(() => {
    return offersForDisplay
      .map((o) => o.sellVolume)
      .filter((v) => v != null && v > 0)
      .sort((a, b) => a - b);
  }, [offersForDisplay]);

  // Sorted avg-daily-vol references — based on full withHistory so tier
  // thresholds are stable when toggling groupByItem.
  const sortedAvgVols = useMemo(() => {
    return withHistory
      .map((o) => o.avgDailyVol)
      .filter((v) => v != null && v > 0)
      .sort((a, b) => a - b);
  }, [withHistory]);

  // Top 10 picks: highest daily volume (midHigh/high tier), coloured by profitability.
  // Only computed once history has loaded; uses best offer per unique product.
  const topPicks = useMemo(() => {
    if (!Object.keys(history).length) return [];
    const bestByType = new Map();
    for (const o of withHistory) {
      const cur = bestByType.get(o.typeID);
      if (!cur || o.iskPerLpSell > cur.iskPerLpSell) bestByType.set(o.typeID, o);
    }
    const candidates = [...bestByType.values()].filter((o) => {
      const tier = volumeTier(o.avgDailyVol, sortedAvgVols);
      return tier === "midHigh" || tier === "high";
    });
    return candidates
      .sort((a, b) => (b.avgDailyVol ?? 0) - (a.avgDailyVol ?? 0))
      .slice(0, 10);
  }, [withHistory, sortedAvgVols, history]);

  const presentCategories = useMemo(() => {
    const seen = new Map();
    for (const o of offersForDisplay) {
      if (o.categoryId != null && !seen.has(o.categoryId)) {
        seen.set(o.categoryId, CATEGORY_LABELS[o.categoryId] ?? `Cat ${o.categoryId}`);
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [offersForDisplay]);

  const filtered = useMemo(() => {
    let result = offersForDisplay;
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((o) => o.name.toLowerCase().includes(q));
    if (categoryFilter != null) result = result.filter((o) => o.categoryId === categoryFilter);
    return result;
  }, [offersForDisplay, search, categoryFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      // Nulls always sink to the bottom regardless of sort direction.
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

  function copyItem(offerId, name) {
    navigator.clipboard.writeText(name).catch(() => {});
    setCopied(offerId);
    setTimeout(() => setCopied((prev) => (prev === offerId ? null : prev)), 1500);
  }

  // Copy this offer's input materials as a multibuy-friendly paste
  // (one "<qty> <name>" per line), so members can paste it into Jita
  // multibuy directly. Uses a distinct copied-token so the per-row
  // checkmark animation doesn't collide with copyItem's name-copy.
  function copyMultibuy(offerId, inputs) {
    if (!inputs?.length) return;
    const text = inputs.map((i) => `${i.quantity} ${i.name}`).join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
    const tag = `mb-${offerId}`;
    setCopied(tag);
    setTimeout(() => setCopied((prev) => (prev === tag ? null : prev)), 1500);
  }

  function exportTsv() {
    const headers = ["Item", "Category", "QTY", "LP Cost", "ISK Cost", "Input Cost",
      "On Market", "Sell Val", "Profit (Sell)", "ISK/LP (Sell)", "ISK/LP (Buy)"];
    const rows = sorted.map((o) => [
      o.name,
      CATEGORY_LABELS[o.categoryId] ?? "",
      o.quantity,
      o.lpCost,
      Math.round(o.iskCost),
      Math.round(o.adjMaterialCost),
      o.sellVolume ?? "",
      Math.round(o.revenueSell),
      Math.round(o.profitSell),
      Math.round(o.iskPerLpSell),
      Math.round(o.iskPerLpBuy),
    ]);
    const tsv = [headers, ...rows]
      .map((r) => r.map((v) => String(v ?? "").replace(/\t/g, " ")).join("\t"))
      .join("\n");
    const blob = new Blob([tsv], { type: "text/tab-separated-values" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lp-${data?.corp?.name?.replace(/\s+/g, "-") ?? "store"}-${new Date().toISOString().slice(0, 10)}.tsv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className={styles.controls}>
        {/* Group 1: corp selector + search filter */}
        <div className={styles.selectorGroup}>
          <div className={styles.field}>
            <label className={styles.label}>CORPORATION</label>
            <select
              className={styles.select}
              value={corpId ?? ""}
              onChange={(e) => setCorpId(parseInt(e.target.value, 10))}
              disabled={corpsLoading || CORP_GROUPS.length === 0}
            >
              {corpsLoading && <option value="">Loading…</option>}
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
          {/* Top Picks — shown once history loads, highest volume, coloured by profitability */}
          {topPicks.length > 0 && (
            <div className={styles.topPicks}>
              <div className={styles.topPicksLabel}>TOP PICKS — HIGH VOLUME · BEST ISK/LP</div>
              <div className={styles.topPicksScroller}>
                <div className={styles.topPicksTrack}>
                  {[...topPicks, ...topPicks].map((o, i) => (
                    <div
                      key={`${o.offerId}-${i}`}
                      className={`${styles.topPickCard} ${o.iskPerLpSell < 0 ? styles.topPickCardNeg : ""}`}
                    >
                      <a
                        href={`https://www.everef.net/type/${o.typeID}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.topPickName}
                        title={o.name}
                      >
                        {o.name}
                      </a>
                      <div className={styles.topPickStats}>
                        <div className={styles.topPickStat}>
                          <span className={o.iskPerLpSell < 0 ? styles.topPickValNeg : styles.topPickVal}>
                            {fmtIskPerLp(o.iskPerLpSell)}
                          </span>
                          <span className={styles.topPickStatLabel}>ISK/LP</span>
                        </div>
                        {o.avgDailyVol != null && (
                          <div className={styles.topPickStat}>
                            <span className={styles.topPickVolVal}>{fmt(o.avgDailyVol)}</span>
                            <span className={styles.topPickStatLabel}>VOL/DAY</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Type filter chips */}
          {presentCategories.length > 1 && (
            <div className={styles.chipRow}>
              <button
                className={`${styles.chip} ${categoryFilter === null ? styles.chipActive : ""}`}
                onClick={() => setCategoryFilter(null)}
              >
                ALL
              </button>
              {presentCategories.map(([catId, label]) => (
                <button
                  key={catId}
                  className={`${styles.chip} ${categoryFilter === catId ? styles.chipActive : ""}`}
                  onClick={() => setCategoryFilter((prev) => prev === catId ? null : catId)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className={styles.tableToolbar}>
            <div className={styles.meta}>
              <div>{filtered.length} / {data.offers.length} offers</div>
              {data.offersUpdatedAt && (
                <div className={styles.cacheAge}>
                  offers {timeAgo(data.offersUpdatedAt)} · prices {timeAgo(data.pricesUpdatedAt)}
                </div>
              )}
            </div>
            <div className={styles.toolbarBtns}>
              <button
                className={`${styles.toggleBtn} ${groupByItem ? styles.toggleBtnActive : ""}`}
                onClick={() => setGroupByItem((g) => !g)}
                title="Show only the best offer per product (highest ISK/LP sell)"
              >
                {groupByItem ? "GROUPED" : "GROUP BY ITEM"}
              </button>
              <button className={styles.toggleBtn} onClick={toggleAdvanced}>
                {advanced ? "SIMPLIFIED" : "ADVANCED"}
              </button>
              <button className={styles.toggleBtn} onClick={exportTsv} title="Download as TSV (Excel/Sheets compatible)">
                EXPORT TSV
              </button>
            </div>
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
                  {advanced && (
                    <th
                      className={styles.thNum}
                      onClick={() => handleSort("sellVolume")}
                      title="Total quantity currently listed on Jita 4-4 sell orders (market depth, not daily sales)"
                    >
                      ON MARKET{arrow("sellVolume")}
                    </th>
                  )}
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
                  const isNegative = o.iskPerLpSell < 0;
                  return (
                    <tr
                      key={o.offerId}
                      className={[
                        o.unknown ? styles.unknown : "",
                        isNegative ? styles.rowNegative : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <td className={styles.tdName}>
                        <div className={styles.nameRow}>
                          <a
                            href={`https://www.everef.net/type/${o.typeID}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.link}
                          >
                            {o.name}
                          </a>
                          <button
                            className={`${styles.copyBtn} ${copied === o.offerId ? styles.copyBtnDone : ""}`}
                            onClick={() => copyItem(o.offerId, o.name)}
                            title="Copy item name"
                          >
                            {copied === o.offerId ? "✓" : "⎘"}
                          </button>
                          {groupByItem && (o.offerCount ?? 1) > 1 && (
                            <span className={styles.offerCount}>{o.offerCount} offers</span>
                          )}
                        </div>
                        {o.inputs.length > 0 && (
                          <div className={styles.inputs}>
                            <button
                              className={`${styles.multibuyBtn} ${copied === `mb-${o.offerId}` ? styles.multibuyBtnDone : ""}`}
                              onClick={() => copyMultibuy(o.offerId, o.inputs)}
                              title="Copy materials as multibuy paste"
                            >
                              {copied === `mb-${o.offerId}` ? "COPIED ✓" : "MULTIBUY"}
                            </button>
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
