import React, { useState, useCallback } from "react";
import Header from "./components/Header.jsx";
import PasteInput from "./components/PasteInput.jsx";
import ResultsTable from "./components/ResultsTable.jsx";
import Summary from "./components/Summary.jsx";
import styles from "./App.module.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function App() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAppraise = useCallback(async (text) => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch(`${API_BASE}/appraise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClear = useCallback(() => {
    setResults(null);
    setError(null);
  }, []);

  return (
    <div className={styles.app}>
      <Header />
      <main className={styles.main}>
        <PasteInput onAppraise={handleAppraise} onClear={handleClear} loading={loading} />
        {error && <div className={styles.error}>⚠ {error}</div>}
        {results && (
          <>
            <Summary totalBuy={results.totalBuy} totalSell={results.totalSell} count={results.items.length} />
            <ResultsTable items={results.items} />
          </>
        )}
      </main>
      <footer className={styles.footer}>
        <span>met0-praisal v0.1.0</span>
        <span>·</span>
        <span>Prices from <a href="https://market.fuzzwork.co.uk/" target="_blank" rel="noopener noreferrer">Fuzzwork</a> · <a href="https://esi.evetech.net/" target="_blank" rel="noopener noreferrer">EVE ESI</a></span>
        <span>·</span>
        <span>Jita 4-4 only</span>
      </footer>
    </div>
  );
}
