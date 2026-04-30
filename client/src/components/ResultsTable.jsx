import React, { useState } from "react";
import styles from "./ResultsTable.module.css";

function formatISK(value) {
  if (value === 0) return "—";
  if (value >= 1e9) return (value / 1e9).toFixed(2) + "B";
  if (value >= 1e6) return (value / 1e6).toFixed(2) + "M";
  if (value >= 1e3) return (value / 1e3).toFixed(1) + "k";
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatQty(qty) {
  return qty.toLocaleString("en-US");
}

export default function ResultsTable({ items }) {
  const [sortKey, setSortKey] = useState("sellTotal");
  const [sortDir, setSortDir] = useState("desc");

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...items].sort((a, b) => {
    let av = a[sortKey];
    let bv = b[sortKey];
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const arrow = (key) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.thName} onClick={() => handleSort("name")}>
              ITEM{arrow("name")}
            </th>
            <th className={styles.thNum} onClick={() => handleSort("quantity")}>
              QTY{arrow("quantity")}
            </th>
            <th className={styles.thNum} onClick={() => handleSort("sellEach")}>
              SELL / UNIT{arrow("sellEach")}
            </th>
            <th className={styles.thNum} onClick={() => handleSort("buyEach")}>
              BUY / UNIT{arrow("buyEach")}
            </th>
            <th className={styles.thNum} onClick={() => handleSort("sellTotal")}>
              SELL TOTAL{arrow("sellTotal")}
            </th>
            <th className={styles.thNum} onClick={() => handleSort("buyTotal")}>
              BUY TOTAL{arrow("buyTotal")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, i) => (
            <tr key={`${item.name}-${i}`} className={item.unknown ? styles.unknown : ""}>
              <td className={styles.tdName}>
                {item.typeID ? (
                  <a
                    href={`https://www.everef.net/type/${item.typeID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.itemLink}
                  >
                    {item.name}
                  </a>
                ) : (
                  <span className={styles.unknownName}>{item.name} <span className={styles.unknownTag}>?</span></span>
                )}
              </td>
              <td className={styles.tdNum}>{formatQty(item.quantity)}</td>
              <td className={`${styles.tdNum} ${styles.sell}`}>{formatISK(item.sellEach)}</td>
              <td className={`${styles.tdNum} ${styles.buy}`}>{formatISK(item.buyEach)}</td>
              <td className={`${styles.tdNum} ${styles.sell}`}>{formatISK(item.sellTotal)}</td>
              <td className={`${styles.tdNum} ${styles.buy}`}>{formatISK(item.buyTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
