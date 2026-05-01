import React from "react";
import styles from "./Summary.module.css";

function fmt(v) {
  if (v >= 1e12) return (v / 1e12).toFixed(2) + " T";
  if (v >= 1e9)  return (v / 1e9).toFixed(2)  + " B";
  if (v >= 1e6)  return (v / 1e6).toFixed(2)  + " M";
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " ISK";
}

function fmtVol(m3) {
  if (m3 >= 1e6) return (m3 / 1e6).toFixed(2) + " M m³";
  if (m3 >= 1e3) return (m3 / 1e3).toFixed(2) + " k m³";
  return m3.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " m³";
}

export default function Summary({ totalBuy, totalSell, count, totalVolume }) {
  return (
    <div className={styles.summary}>
      <div className={styles.stat}>
        <span className={styles.label}>ITEMS</span>
        <span className={styles.value}>{count}</span>
      </div>
      <div className={styles.divider} />
      <div className={styles.stat}>
        <span className={styles.label}>SELL (min)</span>
        <span className={`${styles.value} ${styles.sell}`}>{fmt(totalSell)}</span>
      </div>
      <div className={styles.divider} />
      <div className={styles.stat}>
        <span className={styles.label}>BUY (max)</span>
        <span className={`${styles.value} ${styles.buy}`}>{fmt(totalBuy)}</span>
      </div>
      {totalVolume != null && (
        <>
          <div className={styles.divider} />
          <div className={styles.stat}>
            <span className={styles.label}>VOLUME</span>
            <span className={styles.value}>{fmtVol(totalVolume)}</span>
          </div>
        </>
      )}
    </div>
  );
}
