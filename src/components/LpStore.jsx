import React, { useEffect, useState, useMemo } from "react";
import styles from "./LpStore.module.css";

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

export default function LpStore() {
  const [corpId, setCorpId] = useState(ALL_CORPS[0].id);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState("iskPerLpSell");
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");
  const [advanced, setAdvanced] = useState(() => window.innerWidth >= 768);

  // Draft strings (what the user types) — applied on Calculate
  const [draftLpPrice, setDraftLpPrice] = useState("0");
  const [draftSalesTax, setDraftSalesTax] = useState("0");
  const [draftMfgTax, setDraftMfgTax] = useState("0");

  // Applied values used for computation
  const [lpPrice, setLpPrice] = useState(0);
  const [salesTax, setSalesTax] = useState(0);
  const [mfgTax, setMfgTax] = useState(0);

  function handleCalculate() {
    setLpPrice(Math.max(0, parseFloat(draftLpPrice) || 0));
    setSalesTax(Math.max(0, parseFloat(draftSalesTax) || 0));
    setMfgTax(Math.max(0, parseFloat(draftMfgTax) || 0));
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

        <div className={styles.meta}>
          {data && !loading && (
            <>
              <div>{filtered.length} / {data.offers.length} offers</div>
              {data.offersUpdatedAt && (
                <div className={styles.cacheAge}>
                  offers {timeAgo(data.offersUpdatedAt)} · prices {timeAgo(data.pricesUpdatedAt)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {loading && <div className={styles.loading}>FETCHING LP STORE...</div>}
      {error && <div className={styles.error}>⚠ {error}</div>}

      {data && !loading && (
        <>
          <div className={styles.tableToolbar}>
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
                  <th className={styles.thNum} onClick={() => handleSort("lpCost")}>LP{arrow("lpCost")}</th>
                  {advanced && <th className={styles.thNum} onClick={() => handleSort("iskCost")}>ISK COST{arrow("iskCost")}</th>}
                  {advanced && <th className={styles.thNum} onClick={() => handleSort("adjMaterialCost")}>INPUTS{arrow("adjMaterialCost")}</th>}
                  {advanced && <th className={styles.thNum} onClick={() => handleSort("sellVolume")}>SELL VOL{arrow("sellVolume")}</th>}
                  {advanced && <th className={styles.thNum} onClick={() => handleSort("revenueSell")}>SELL VAL{arrow("revenueSell")}</th>}
                  {advanced && <th className={styles.thNum} onClick={() => handleSort("profitSell")}>PROFIT (SELL){arrow("profitSell")}</th>}
                  <th className={`${styles.thNum} ${styles.thHighlight}`} onClick={() => handleSort("iskPerLpSell")}>
                    ISK/LP (SELL){arrow("iskPerLpSell")}
                  </th>
                  {advanced && <th className={styles.thNum} onClick={() => handleSort("iskPerLpBuy")}>ISK/LP (BUY){arrow("iskPerLpBuy")}</th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((o) => (
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
                    <td className={styles.tdNum}>{o.lpCost.toLocaleString()}</td>
                    {advanced && <td className={styles.tdNum}>{fmt(o.iskCost)}</td>}
                    {advanced && <td className={styles.tdNum}>{fmt(o.adjMaterialCost)}</td>}
                    {advanced && <td className={styles.tdNum}>{o.sellVolume != null ? fmt(o.sellVolume) : "—"}</td>}
                    {advanced && <td className={`${styles.tdNum} ${styles.sell}`}>{fmt(o.revenueSell)}</td>}
                    {advanced && (
                      <td className={`${styles.tdNum} ${o.profitSell >= 0 ? styles.sell : styles.danger}`}>
                        {fmt(o.profitSell)}
                      </td>
                    )}
                    <td className={`${styles.tdNum} ${styles.highlight} ${o.iskPerLpSell >= 0 ? styles.sell : styles.danger}`}>
                      {fmtIskPerLp(o.iskPerLpSell)}
                    </td>
                    {advanced && (
                      <td className={`${styles.tdNum} ${o.iskPerLpBuy >= 0 ? styles.buy : styles.danger}`}>
                        {fmtIskPerLp(o.iskPerLpBuy)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
