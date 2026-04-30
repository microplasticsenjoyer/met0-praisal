import React, { useState, useEffect } from "react";
import Header from "./components/Header.jsx";
import PasteInput from "./components/PasteInput.jsx";
import ResultsTable from "./components/ResultsTable.jsx";
import Summary from "./components/Summary.jsx";
import ShareBar from "./components/ShareBar.jsx";
import Tabs from "./components/Tabs.jsx";
import LpStore from "./components/LpStore.jsx";
import styles from "./App.module.css";

const TAB_OPTIONS = [
  { value: "appraise", label: "Appraise" },
  { value: "lp", label: "LP Store" },
];

export default function App() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadingShared, setLoadingShared] = useState(false);
  const [tab, setTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("a")) return "appraise";
    return params.get("tab") === "lp" ? "lp" : "appraise";
  });

  // On load, check if URL has a slug (e.g. /?a=x7k2p)
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("a");
    if (slug) loadShared(slug);
  }, []);

  function handleTabChange(next) {
    setTab(next);
    const url = next === "lp" ? "?tab=lp" : window.location.pathname;
    window.history.replaceState({}, "", url);
  }

  async function loadShared(slug) {
    setLoadingShared(true);
    setError(null);
    try {
      const res = await fetch(`/api/appraisal/${slug}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Not found");
      setResults({ ...data, slug });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingShared(false);
    }
  }

  async function handleAppraise(text) {
    setLoading(true);
    setError(null);
    setResults(null);
    // Clear slug from URL without reload
    window.history.replaceState({}, "", window.location.pathname);

    try {
      const res = await fetch("/api/appraise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      // Update URL to shareable link
      window.history.replaceState({}, "", `?a=${data.slug}`);
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
    window.history.replaceState({}, "", window.location.pathname);
  }

  return (
    <div className={styles.app}>
      <Header />
      <main className={styles.main}>
        <Tabs value={tab} onChange={handleTabChange} options={TAB_OPTIONS} />
        {tab === "appraise" && (
          loadingShared ? (
            <div className={styles.loading}>LOADING APPRAISAL...</div>
          ) : (
            <>
              <PasteInput
                onAppraise={handleAppraise}
                onClear={handleClear}
                loading={loading}
                prefill={results?.rawInput}
              />
              {error && <div className={styles.error}>⚠ {error}</div>}
              {results && (
                <>
                  <ShareBar slug={results.slug} createdAt={results.createdAt} />
                  <Summary totalBuy={Number(results.totalBuy)} totalSell={Number(results.totalSell)} count={results.items.length} />
                  <ResultsTable items={results.items} />
                </>
              )}
            </>
          )
        )}
        {tab === "lp" && <LpStore />}
      </main>
      <footer className={styles.footer}>
        <span>met0-praisal v0.1.0</span>
        <span>·</span>
        <span>Prices: <a href="https://market.fuzzwork.co.uk/" target="_blank" rel="noopener noreferrer">Fuzzwork</a> · <a href="https://esi.evetech.net/" target="_blank" rel="noopener noreferrer">EVE ESI</a></span>
        <span>·</span>
        <span>Jita 4-4 only</span>
        <span>·</span>
        <a href="https://github.com/microplasticsenjoyer/met0-praisal" target="_blank" rel="noopener noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
