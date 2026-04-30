import React from "react";
import styles from "./Tabs.module.css";

export default function Tabs({ value, onChange, options }) {
  return (
    <div className={styles.tabs} role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={value === opt.value}
          className={`${styles.tab} ${value === opt.value ? styles.active : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
