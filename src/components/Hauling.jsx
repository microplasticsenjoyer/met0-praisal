import React, { useState, useMemo } from "react";
import styles from "./Hauling.module.css";
import PasteInput from "./PasteInput.jsx";
import { HAULING_SHIPS } from "../lib/haulingShips.js";

const STORAGE_PREFIX = "met0:hauling:";

function readStored(key, fallback = "") {
  try { return localStorage.getItem(STORAGE_PREFIX + key) ?? fallback; } catch { return fallback; }
}
function writeStored(key, value) {
  try { localStorage.setItem(STORAGE_PREFIX + key, value); } catch {}
}
function parseStored(key, fallback = 0) {
  const v = parseFloat(readStored(key, String(fallback)));
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function fmt(v) {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + "k";
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtVol(m3) {
  if (m3 == null || !Number.isFinite(m3)) return "—";
  if (m3 >= 1e6) return (m3 / 1e6).toFixed(2) + "M m³";
  if (m3 >= 1e3) return (m3 / 1e3).toFixed(1) + "k m³";
  if (m3 < 1) return m3.toFixed(4).replace(/\.?0+$/, "") + " m³";
  return m3.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " m³";
}

// Group ships by group field for <optgroup> rendering (order preserved from array).
const SHIP_GROUPS = (() => {
  const map = new Map();
  for (const ship of HAULING_SHIPS) {
    if (!map.has(ship.group)) map.set(ship.group, []);
    map.get(ship.group).push(ship);
  }
  return [...map.entries()];
})();

export default function Hauling() {
  const [results, setResults]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const [shipId, setShipId]       = useState(() => readStored("shipId", "bustard"));
  const [cargoInput, setCargoInput] = useState(() => readStored("cargo", ""));

  const [costPerM3, setCostPerM3] = useState(() => parseStored("costPerM3", 1000));
  const [salesTax, setSalesTax]   = useState(() => parseStored("salesTax", 3.6));

  const [sortKey, setSortKey]     = useState("netProfitPerM3");
  const [sortDir, setSortDir]     = useState("desc");

  // Effective cargo: explicit override > ship base.
  const effectiveCargo = useMemo(() => {
    const override = parseFloat(cargoInput);
    if (Number.isFinite(override) && override > 0) return override;
    return HAULING_SHIPS.find((s) => s.id === shipId)?.cargo ?? 62500;
  }, [shipId, cargoInput]);

  function handleShipChange(id) {
    setShipId(id);
    setCargoInput("");
    writeStored("shipId", id);
    writeStored("cargo", "");
  }

  function handleCargoInput(val) {
    setCargoInput(val);
    writeStored("cargo", val);
  }

  function handleCostPerM3(val) {
    const n = Math.max(0, parseFloat(val) || 0);
    setCostPerM3(n);
    writeStored("costPerM3", String(n));
  }

  function handleSalesTax(val) {
    const n = Math.max(0, parseFloat(val) || 0);
    setSalesTax(n);
    writeStored("salesTax", String(n));
  }

  async function handleAppraise(text) {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/appraise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, stationId: 60003760 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setResults(null);
    setError(null);
  }

  // ── Computed values ─────────────────────────────────────────────────────

  const enrichedItems = useMemo(() => {
    if (!results?.items) return [];
    return results.items.map((item) => {
      const vol = item.volumeEach;
      if (item.unknown || vol == null || vol <= 0) {
        return { ...item, volumeTotal: null, haulCostPerUnit: null, netProfitPerUnit: null, netProfitTotal: null, netProfitPerM3: null, isProfitable: false };
      }
      const haulCostPerUnit  = vol * costPerM3;
      const taxAmount        = item.sellEach * (salesTax / 100);
      const netProfitPerUnit = item.sellEach - haulCostPerUnit - taxAmount;
      const volumeTotal      = vol * item.quantity;
      const netProfitPerM3   = netProfitPerUnit / vol;
      const netProfitTotal   = netProfitPerUnit * item.quantity;
      return { ...item, volumeTotal, haulCostPerUnit, netProfitPerUnit, netProfitTotal, netProfitPerM3, isProfitable: netProfitPerUnit > 0 };
    });
  }, [results, costPerM3, salesTax]);

  const cargoFillPlan = useMemo(() => {
    const empty = { inCargo: new Set(), partialItem: null, partialFraction: 0, cargoUsed: 0, remaining: effectiveCargo, totalProfit: 0 };
    if (!enrichedItems.length || effectiveCargo <= 0) return empty;

    const profitable = enrichedItems
      .filter((i) => i.isProfitable && i.volumeTotal != null && i.volumeTotal > 0)
      .sort((a, b) => b.netProfitPerM3 - a.netProfitPerM3);

    if (!profitable.length) return empty;

    const inCargo = new Set();
    let remaining  = effectiveCargo;
    let totalProfit = 0;
    let cargoUsed   = 0;
    let partialItem = null;
    let partialFraction = 0;

    for (const item of profitable) {
      if (item.volumeTotal <= remaining) {
        inCargo.add(item.typeID);
        remaining    -= item.volumeTotal;
        totalProfit  += item.netProfitTotal;
        cargoUsed    += item.volumeTotal;
      } else if (remaining > 0 && item.volumeEach > 0) {
        const partialQty = Math.floor(remaining / item.volumeEach);
        if (partialQty > 0) {
          partialItem     = item.typeID;
          partialFraction = partialQty / item.quantity;
          totalProfit    += item.netProfitPerUnit * partialQty;
          cargoUsed      += item.volumeEach * partialQty;
          remaining      -= item.volumeEach * partialQty;
        }
        break;
      }
    }

    return { inCargo, partialItem, partialFraction, cargoUsed, remaining, totalProfit };
  }, [enrichedItems, effectiveCargo]);

  const sortedItems = useMemo(() => {
    const arr = [...enrichedItems];
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
  }, [enrichedItems, sortKey, sortDir]);

  const summaryStats = useMemo(() => {
    const totalVolume    = enrichedItems.reduce((s, i) => s + (i.volumeTotal ?? 0), 0);
    const profitableCount = enrichedItems.filter((i) => i.isProfitable).length;
    const unknownCount   = (results?.items?.length ?? 0) - enrichedItems.filter((i) => !i.unknown).length;
    const cargoFillPct   = effectiveCargo > 0 ? (cargoFillPlan.cargoUsed / effectiveCargo) * 100 : 0;
    return { totalItems: enrichedItems.length, unknownCount, totalVolume, profitableCount, cargoFillPct };
  }, [enrichedItems, cargoFillPlan, effectiveCargo, results]);

  function handleSort(key) {
    setSortDir((d) => sortKey === key ? (d === "desc" ? "asc" : "desc") : "desc");
    setSortKey(key);
  }

  function arr(key) {
    if (sortKey !== key) return null;
    return <span style={{ marginLeft: 4 }}>{sortDir === "desc" ? "▼" : "▲"}</span>;
  }

  const currentShip = HAULING_SHIPS.find((s) => s.id === shipId);

  return (
    <>
      {/* ── Controls ─────────────────────────────────────────────────── */}
      <div className={styles.controls}>
        <div className={styles.shipGroup}>
          <div className={styles.field}>
            <label className={styles.label}>SHIP</label>
            <select
              className={styles.select}
              value={shipId}
              onChange={(e) => handleShipChange(e.target.value)}
            >
              {SHIP_GROUPS.map(([group, ships]) => (
                <optgroup key={group} label={group}>
                  {ships.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {fmtVol(s.cargo)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>CARGO (m³)</label>
            <input
              type="text"
              inputMode="decimal"
              className={styles.numInput}
              placeholder={currentShip ? String(currentShip.cargo) : ""}
              value={cargoInput}
              onChange={(e) => handleCargoInput(e.target.value)}
              onFocus={(e) => e.target.select()}
              style={{ width: 140 }}
            />
          </div>
        </div>
        <div className={styles.costGroup}>
          <div className={styles.field}>
            <label className={styles.label}>HAUL COST (ISK/m³)</label>
            <input
              type="text"
              inputMode="decimal"
              className={styles.numInput}
              value={costPerM3 || ""}
              placeholder="0"
              onChange={(e) => handleCostPerM3(e.target.value)}
              onFocus={(e) => e.target.select()}
              style={{ width: 130 }}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>SALES TAX %</label>
            <input
              type="text"
              inputMode="decimal"
              className={styles.numInput}
              value={salesTax || ""}
              placeholder="0"
              onChange={(e) => handleSalesTax(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </div>
        </div>
      </div>

      {/* ── Paste input ──────────────────────────────────────────────── */}
      <PasteInput
        onAppraise={handleAppraise}
        onClear={handleClear}
        loading={loading}
      />

      {error  && <div className={styles.error}>⚠ {error}</div>}
      {loading && <div className={styles.loading}>APPRAISING CARGO...</div>}

      {/* ── Results ──────────────────────────────────────────────────── */}
      {results && !loading && (
        <>
          {/* Summary cards */}
          <div className={styles.summaryCards}>
            <div className={styles.summaryCard}>
              <span className={styles.cardLabel}>ITEMS</span>
              <span className={styles.cardValue}>{summaryStats.totalItems.toLocaleString()}</span>
              {summaryStats.unknownCount > 0 && (
                <span className={styles.cardSub}>{summaryStats.unknownCount} unresolved</span>
              )}
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.cardLabel}>TOTAL VOLUME</span>
              <span className={styles.cardValue}>{fmtVol(summaryStats.totalVolume)}</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.cardLabel}>TRIP PROFIT</span>
              <span className={`${styles.cardValue} ${cargoFillPlan.totalProfit >= 0 ? styles.cardValueSell : ""}`}>
                {fmt(cargoFillPlan.totalProfit)}
              </span>
              <span className={styles.cardSub}>at {fmtVol(effectiveCargo)} cargo</span>
            </div>
            <div className={styles.cargoCard}>
              <span className={styles.cardLabel}>CARGO USED</span>
              <span className={styles.cardValue}>
                {fmtVol(cargoFillPlan.cargoUsed)} / {fmtVol(effectiveCargo)}
              </span>
              <div className={styles.progressBarWrap}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${Math.min(summaryStats.cargoFillPct, 100)}%` }}
                />
              </div>
              <span className={styles.cardSub}>{summaryStats.cargoFillPct.toFixed(1)}% full</span>
            </div>
          </div>

          {summaryStats.profitableCount === 0 && (
            <div className={styles.warnBanner}>
              No items are profitable at {costPerM3.toLocaleString()} ISK/m³ + {salesTax}% tax. Lower the hauling cost or tax rate.
            </div>
          )}

          <div className={styles.tableToolbar}>
            <span className={styles.meta}>
              {enrichedItems.length} items · {summaryStats.profitableCount} profitable
              {summaryStats.unknownCount > 0 && ` · ${summaryStats.unknownCount} unresolved`}
            </span>
          </div>

          <div className={styles.wrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thName} onClick={() => handleSort("name")}>ITEM {arr("name")}</th>
                  <th className={styles.thNum}  onClick={() => handleSort("quantity")}>QTY {arr("quantity")}</th>
                  <th className={styles.thNum}  onClick={() => handleSort("volumeEach")}>VOL/UNIT {arr("volumeEach")}</th>
                  <th className={styles.thNum}  onClick={() => handleSort("volumeTotal")}>TOTAL VOL {arr("volumeTotal")}</th>
                  <th className={styles.thNum}  onClick={() => handleSort("sellEach")}>SELL/UNIT {arr("sellEach")}</th>
                  <th className={styles.thNum}  onClick={() => handleSort("haulCostPerUnit")}>HAUL COST {arr("haulCostPerUnit")}</th>
                  <th className={styles.thNum}  onClick={() => handleSort("netProfitTotal")}>NET PROFIT {arr("netProfitTotal")}</th>
                  <th className={`${styles.thNum} ${styles.thHighlight}`} onClick={() => handleSort("netProfitPerM3")}>ISK/m³ {arr("netProfitPerM3")}</th>
                  <th className={styles.thCargo}>IN CARGO</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item, i) => {
                  const inCargo  = cargoFillPlan.inCargo.has(item.typeID);
                  const isPartial = cargoFillPlan.partialItem === item.typeID;
                  const rowClass = [
                    inCargo                                      ? styles.rowInCargo      : "",
                    isPartial                                    ? styles.rowPartial      : "",
                    !item.isProfitable && item.netProfitPerM3 != null ? styles.rowUnprofitable : "",
                  ].filter(Boolean).join(" ");
                  return (
                    <tr key={`${item.typeID}-${i}`} className={rowClass}>
                      <td className={styles.tdName}>
                        <a
                          className={styles.link}
                          href={`https://www.everef.net/type/${item.typeID}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {item.name}
                        </a>
                      </td>
                      <td className={styles.tdNum}>{item.quantity.toLocaleString()}</td>
                      <td className={styles.tdNum}>{item.volumeEach != null ? fmtVol(item.volumeEach) : "—"}</td>
                      <td className={styles.tdNum}>{item.volumeTotal != null ? fmtVol(item.volumeTotal) : "—"}</td>
                      <td className={`${styles.tdNum} ${styles.sell}`}>{fmt(item.sellEach)}</td>
                      <td className={styles.tdNum}>{item.haulCostPerUnit != null ? fmt(item.haulCostPerUnit) : "—"}</td>
                      <td className={`${styles.tdNum} ${item.netProfitTotal != null ? (item.netProfitTotal >= 0 ? styles.sell : styles.danger) : ""}`}>
                        {item.netProfitTotal != null ? fmt(item.netProfitTotal) : "—"}
                      </td>
                      <td className={`${styles.tdNum} ${styles.highlight} ${item.netProfitPerM3 != null ? (item.netProfitPerM3 >= 0 ? styles.sell : styles.danger) : ""}`}>
                        {item.netProfitPerM3 != null ? fmt(item.netProfitPerM3) : "—"}
                      </td>
                      <td className={styles.tdCargo}>
                        {inCargo   && <span className={styles.inCargoCheck}>✓</span>}
                        {isPartial && (
                          <span className={styles.partialCheck}>
                            ~{Math.round(cargoFillPlan.partialFraction * 100)}%
                          </span>
                        )}
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
