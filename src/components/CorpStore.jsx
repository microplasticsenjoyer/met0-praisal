import React, { useEffect, useState, useMemo } from "react";
import styles from "./CorpStore.module.css";
import { useCorpGroups } from "../lib/corps.js";

const STORAGE_PREFIX = "met0:corpStore:";
function readStored(key, fallback = "0") {
  try { return localStorage.getItem(STORAGE_PREFIX + key) ?? fallback; } catch { return fallback; }
}
function writeStored(key, value) {
  try { localStorage.setItem(STORAGE_PREFIX + key, String(value ?? "")); } catch {}
}
function parseStored(key, fallback = 0) {
  return Math.max(0, parseFloat(readStored(key, String(fallback))) || fallback);
}

function fmt(v) {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + "k";
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPct(v) {
  if (v == null || !isFinite(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
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

export default function CorpStore() {
  const { groups: CORP_GROUPS, allCorps: ALL_CORPS, enabledCorps: ENABLED_CORPS, loading: corpsLoading } = useCorpGroups();
  const [corpId, setCorpId] = useState(null);

  useEffect(() => {
    if (corpId == null && ALL_CORPS.length > 0) {
      setCorpId(ENABLED_CORPS[0]?.id ?? ALL_CORPS[0].id);
    }
  }, [ALL_CORPS, ENABLED_CORPS, corpId]);

  const selectedCorp = ALL_CORPS.find((c) => c.id === corpId) ?? null;
  const corpDisabled = !!selectedCorp?.disabled;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Draft inputs (typed values) — applied on Calculate.
  const [draftAcqPrice, setDraftAcqPrice] = useState(() => readStored("acqPrice", ""));
  const [draftMarkup, setDraftMarkup]     = useState(() => readStored("markup", "10"));

  // Applied values used for computation.
  const [acqPrice, setAcqPrice] = useState(() => parseStored("acqPrice", 0));
  const [markup,   setMarkup]   = useState(() => parseStored("markup", 10));

  const [search, setSearch] = useState("");
  const [hideOverpriced, setHideOverpriced] = useState(false);
  const [sortKey, setSortKey]   = useState("pctSavings");
  const [sortDir, setSortDir]   = useState("desc");
  const [copied, setCopied] = useState(null);

  function handleCalculate() {
    const aq = Math.max(0, parseFloat(draftAcqPrice) || 0);
    const mk = Math.max(0, parseFloat(draftMarkup)   || 0);
    setAcqPrice(aq);
    setMarkup(mk);
    writeStored("acqPrice", draftAcqPrice);
    writeStored("markup",   draftMarkup);
  }

  function numInput(value, setter, placeholder) {
    return (
      <input
        type="text"
        inputMode="decimal"
        className={styles.numInput}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setter(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === "Enter") handleCalculate(); }}
      />
    );
  }

  useEffect(() => {
    if (corpId == null) return;
    if (corpDisabled) {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setData(null);
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
  }, [corpId, corpDisabled]);

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }
  const arrow = (key) => sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  // Step 1: enrich with corp pricing, grouped to best (cheapest) offer per product.
  const enriched = useMemo(() => {
    if (!data?.offers) return [];
    const bestByType = new Map();
    for (const o of data.offers) {
      // inputCost already includes iskCost + all required input material costs.
      const rawCostTotal   = o.inputCost + o.lpCost * acqPrice;
      const corpPriceTotal = rawCostTotal * (1 + markup / 100);
      // Per-unit values for clean display (EVE prices are always quoted per unit).
      const rawCost    = o.quantity > 0 ? rawCostTotal   / o.quantity : 0;
      const corpPrice  = o.quantity > 0 ? corpPriceTotal / o.quantity : 0;
      const jitaSell   = o.productSell;
      const jitaBuy    = o.productBuy;
      const vsJitaSell = corpPrice - jitaSell;        // negative = member saves
      const pctSavings = jitaSell > 0
        ? (jitaSell - corpPrice) / jitaSell * 100     // positive = good deal
        : 0;
      const vsJitaBuy  = corpPrice - jitaBuy;

      const enrichedOffer = {
        ...o, rawCost, corpPrice, jitaSell, jitaBuy,
        vsJitaSell, pctSavings, vsJitaBuy,
      };
      const cur = bestByType.get(o.typeID);
      if (!cur || corpPrice < cur.corpPrice) bestByType.set(o.typeID, enrichedOffer);
    }
    return [...bestByType.values()];
  }, [data, acqPrice, markup]);

  const filtered = useMemo(() => {
    let result = enriched.filter((o) => !o.unknown);
    if (hideOverpriced) result = result.filter((o) => o.vsJitaSell < 0);
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((o) => o.name.toLowerCase().includes(q));
    return result;
  }, [enriched, search, hideOverpriced]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Top 5 deals by % savings (for members)
  const topDeals = useMemo(() => {
    return [...enriched]
      .filter((o) => !o.unknown && o.pctSavings > 0)
      .sort((a, b) => b.pctSavings - a.pctSavings)
      .slice(0, 5);
  }, [enriched]);

  function copyItem(typeID, name) {
    navigator.clipboard.writeText(name).catch(() => {});
    setCopied(typeID);
    setTimeout(() => setCopied((p) => (p === typeID ? null : p)), 1500);
  }

  function exportTsv() {
    const headers = ["Item", "QTY", "LP Cost", "ISK Cost", "Input Cost", "Raw Cost/Unit",
      "Corp Price/Unit", "Jita Sell", "vs Jita Sell", "% Savings", "Jita Buy", "vs Jita Buy"];
    const rows = sorted.map((o) => [
      o.name, o.quantity, o.lpCost,
      Math.round(o.iskCost), Math.round(o.adjMaterialCost ?? (o.inputCost - o.iskCost)),
      Math.round(o.rawCost), Math.round(o.corpPrice),
      Math.round(o.jitaSell), Math.round(o.vsJitaSell),
      o.pctSavings.toFixed(2),
      Math.round(o.jitaBuy), Math.round(o.vsJitaBuy),
    ]);
    const tsv = [headers, ...rows]
      .map((r) => r.map((v) => String(v ?? "").replace(/\t/g, " ")).join("\t"))
      .join("\n");
    const blob = new Blob([tsv], { type: "text/tab-separated-values" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `corp-lp-${data?.corp?.name?.replace(/\s+/g, "-") ?? "store"}-${new Date().toISOString().slice(0, 10)}.tsv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const acqPriceSet = acqPrice > 0;

  return (
    <>
      {/* Controls */}
      <div className={styles.controls}>
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
                      {c.name} — {c.faction}{c.disabled ? " (coming soon)" : ""}
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

        <div className={styles.taxGroup}>
          <div className={styles.field}>
            <label className={styles.label}>LP ACQUISITION COST (ISK/LP)</label>
            {numInput(draftAcqPrice, setDraftAcqPrice, "e.g. 900")}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>MARKUP %</label>
            {numInput(draftMarkup, setDraftMarkup, "10")}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>&nbsp;</label>
            <button className={styles.calcBtn} onClick={handleCalculate}>CALCULATE</button>
          </div>
        </div>
      </div>

      {corpDisabled && (
        <div className={styles.notice}>
          {selectedCorp?.name ?? "This LP store"} — coming soon. We're working on it.
        </div>
      )}

      {!corpDisabled && !acqPriceSet && !loading && data && (
        <div className={styles.notice}>
          Enter your LP acquisition cost above and click CALCULATE to see corp pricing.
        </div>
      )}

      {!corpDisabled && loading && <div className={styles.loading}>FETCHING LP STORE...</div>}
      {!corpDisabled && error   && <div className={styles.error}>⚠ {error}</div>}

      {!corpDisabled && data && !loading && acqPriceSet && (
        <>
          {/* Top Deals banner */}
          {topDeals.length > 0 && (
            <div className={styles.topDeals}>
              <div className={styles.topDealsLabel}>TOP DEALS FOR MEMBERS — best savings vs Jita</div>
              <div className={styles.topDealsScroller}>
                <div className={styles.topDealsTrack}>
                  {[...topDeals, ...topDeals].map((o, i) => (
                    <div key={`${o.offerId}-${i}`} className={styles.topDealCard}>
                      <span className={styles.topDealName} title={o.name}>{o.name}</span>
                      <div className={styles.topDealStats}>
                        <div className={styles.topDealStat}>
                          <span className={styles.topDealPct}>{fmtPct(o.pctSavings)}</span>
                          <span className={styles.topDealStatLabel}>SAVED</span>
                        </div>
                        <div className={styles.topDealStat}>
                          <span className={styles.topDealPrice}>{fmt(o.corpPrice)}</span>
                          <span className={styles.topDealStatLabel}>CORP / UNIT</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className={styles.tableToolbar}>
            <div className={styles.meta}>
              <div>{filtered.length} / {enriched.filter((o) => !o.unknown).length} items</div>
              {data.offersUpdatedAt && (
                <div className={styles.cacheAge}>
                  offers {timeAgo(data.offersUpdatedAt)} · prices {timeAgo(data.pricesUpdatedAt)}
                </div>
              )}
            </div>
            <div className={styles.toolbarBtns}>
              <button
                className={`${styles.toggleBtn} ${hideOverpriced ? styles.toggleBtnActive : ""}`}
                onClick={() => setHideOverpriced((h) => !h)}
                title="Hide items where corp price exceeds Jita sell"
              >
                {hideOverpriced ? "DEALS ONLY" : "HIDE OVERPRICED"}
              </button>
              <button className={styles.toggleBtn} onClick={exportTsv} title="Download as TSV">
                EXPORT TSV
              </button>
            </div>
          </div>

          <div className={styles.wrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thName} onClick={() => handleSort("name")}>ITEM{arrow("name")}</th>
                  <th className={styles.thNum} onClick={() => handleSort("quantity")}>QTY{arrow("quantity")}</th>
                  <th className={styles.thNum} onClick={() => handleSort("lpCost")}>LP{arrow("lpCost")}</th>
                  <th className={styles.thNum} onClick={() => handleSort("iskCost")}>ISK COST{arrow("iskCost")}</th>
                  <th
                    className={styles.thNum}
                    onClick={() => handleSort("rawCost")}
                    title="(ISK cost + input materials + LP cost × acquisition price) ÷ quantity"
                  >
                    RAW / UNIT{arrow("rawCost")}
                  </th>
                  <th
                    className={`${styles.thNum} ${styles.thHighlight}`}
                    onClick={() => handleSort("corpPrice")}
                    title={`Raw cost × ${(1 + markup / 100).toFixed(2)} (${markup}% markup)`}
                  >
                    CORP / UNIT{arrow("corpPrice")}
                  </th>
                  <th className={styles.thNum} onClick={() => handleSort("jitaSell")}>JITA SELL{arrow("jitaSell")}</th>
                  <th
                    className={styles.thNum}
                    onClick={() => handleSort("vsJitaSell")}
                    title="Corp price minus Jita sell. Negative = member saves money vs market."
                  >
                    vs JITA{arrow("vsJitaSell")}
                  </th>
                  <th
                    className={`${styles.thNum} ${styles.thSort}`}
                    onClick={() => handleSort("pctSavings")}
                    title="(Jita sell − corp price) ÷ Jita sell. Positive = members pay less than Jita."
                  >
                    % SAVINGS{arrow("pctSavings")}
                  </th>
                  <th className={styles.thNum} onClick={() => handleSort("jitaBuy")}>JITA BUY{arrow("jitaBuy")}</th>
                  <th
                    className={styles.thNum}
                    onClick={() => handleSort("vsJitaBuy")}
                    title="Corp price minus Jita buy. Negative = member saves vs buy orders too."
                  >
                    vs BUY{arrow("vsJitaBuy")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((o) => {
                  const goodDeal  = o.vsJitaSell < 0;
                  const greatDeal = o.pctSavings >= 10;
                  const badDeal   = o.vsJitaSell >= 0;
                  return (
                    <tr
                      key={o.offerId}
                      className={greatDeal ? styles.rowGreat : badDeal ? styles.rowBad : ""}
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
                            className={`${styles.copyBtn} ${copied === o.typeID ? styles.copyBtnDone : ""}`}
                            onClick={() => copyItem(o.typeID, o.name)}
                            title="Copy item name"
                          >
                            {copied === o.typeID ? "✓" : "⎘"}
                          </button>
                        </div>
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
                      <td className={styles.tdNum}>{o.quantity.toLocaleString()}</td>
                      <td className={styles.tdNum}>{o.lpCost.toLocaleString()}</td>
                      <td className={styles.tdNum}>{fmt(o.iskCost)}</td>
                      <td className={styles.tdNum}>{fmt(o.rawCost)}</td>
                      <td className={`${styles.tdNum} ${styles.highlight}`}>{fmt(o.corpPrice)}</td>
                      <td className={styles.tdNum}>{fmt(o.jitaSell)}</td>
                      <td className={`${styles.tdNum} ${goodDeal ? styles.sell : styles.danger}`}>
                        {fmt(o.vsJitaSell)}
                      </td>
                      <td className={`${styles.tdNum} ${styles.pctCell} ${goodDeal ? styles.sell : styles.danger}`}>
                        {fmtPct(o.pctSavings)}
                      </td>
                      <td className={styles.tdNum}>{fmt(o.jitaBuy)}</td>
                      <td className={`${styles.tdNum} ${o.vsJitaBuy < 0 ? styles.sell : styles.danger}`}>
                        {fmt(o.vsJitaBuy)}
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
