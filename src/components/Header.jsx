import React from "react";
import styles from "./Header.module.css";

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <a href="/" className={styles.logo}>
          <span className={styles.logoAccent}>met0</span>
          <span className={styles.logoDash}>-</span>
          <span className={styles.logoMain}>praisal</span>
        </a>
        <div className={styles.sub}>EVE Online · Live Market Prices</div>
      </div>
      <div className={styles.scanline} />
    </header>
  );
}
