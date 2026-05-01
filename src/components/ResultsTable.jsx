import React, { useState } from "react";
import styles from "./ResultsTable.module.css";

function fmt(v) {
  if (v === 0) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "k";
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtVol(m3) {
  if (m3 == null) return "—";
  if (m3 >= 1e6) return (m3 / 1e6).toFixed(2) + "M m³";
  if (m3 >= 1e3) return (m3 / 1e3).toFixed(2) + "k m³";
  return m3.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " m³";
}

export default function ResultsTable({ items }) {
  const [sortKey, setSortKey] = useState("sellTotal");
  const [sortDir, setSortDir] = useState("desc");

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const withVolume = items.map((item) => ({
    ...item,
    volumeTotal: item.volumeEach != null ? item.volumeEach * item.quantity : null,
  }));

  const sorted = [...withVolume].sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const arr = (key) => sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.thName} onClick={() => handleSort("name")}>ITEM{arr("name")}</th>
            <th className={styles.thNum} onClick={() => handleSort("quantity")}>QTY{arr("quantity")}</th>
            <th className={styles.thNum} onClick={() => handleSort("volumeTotal")}>VOLUME{arr("volumeTotal")}</th>
            <th className={styles.thNum} onClick={() => handleSort("sellEach")}>SELL / UNIT{arr("sellEach")}</th>
            <th className={styles.thNum} onClick={() => handleSort("buyEach")}>BUY / UNIT{arr("buyEach")}</th>
            <th className={styles.thNum} onClick={() => handleSort("sellTotal")}>SELL TOTAL{arr("sellTotal")}</th>
            <th className={styles.thNum} onClick={() => handleSort("buyTotal")}>BUY TOTAL{arr("buyTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, i) => (
            <tr key={`${item.name}-${i}`} className={item.unknown ? styles.unknown : ""}>
              <td className={styles.tdName}>
                {item.typeID ? (
                  <a href={`https://www.everef.net/type/${item.typeID}`} target="_blank" rel="noopener noreferrer" className={styles.link}>
                    {item.name}
                  </a>
                ) : (
                  <span className={styles.unknownName}>{item.name} <span className={styles.unknownTag}>?</span></span>
                )}
              </td>
              <td className={styles.tdNum}>{item.quantity.toLocaleString()}</td>
              <td className={`${styles.tdNum} ${styles.volCell}`}>{fmtVol(item.volumeTotal)}</td>
              <td className={`${styles.tdNum} ${styles.sell}`}>{fmt(item.sellEach)}</td>
              <td className={`${styles.tdNum} ${styles.buy}`}>{fmt(item.buyEach)}</td>
              <td className={`${styles.tdNum} ${styles.sell}`}>{fmt(item.sellTotal)}</td>
              <td className={`${styles.tdNum} ${styles.buy}`}>{fmt(item.buyTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
