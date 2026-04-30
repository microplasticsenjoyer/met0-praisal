import React from "react";
import styles from "./Summary.module.css";

function formatISK(value) {
  if (value >= 1e12) return (value / 1e12).toFixed(2) + " T";
  if (value >= 1e9) return (value / 1e9).toFixed(2) + " B";
  if (value >= 1e6) return (value / 1e6).toFixed(2) + " M";
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " ISK";
}

export default function Summary({ totalBuy, totalSell, count }) {
  return (
    <div className={styles.summary}>
      <div className={styles.stat}>
        <span className={styles.statLabel}>ITEMS</span>
        <span className={styles.statValue}>{count}</span>
      </div>
      <div className={styles.divider} />
      <div className={styles.stat}>
        <span className={styles.statLabel}>SELL (min)</span>
        <span className={`${styles.statValue} ${styles.sell}`}>{formatISK(totalSell)}</span>
      </div>
      <div className={styles.divider} />
      <div className={styles.stat}>
        <span className={styles.statLabel}>BUY (max)</span>
        <span className={`${styles.statValue} ${styles.buy}`}>{formatISK(totalBuy)}</span>
      </div>
    </div>
  );
}
