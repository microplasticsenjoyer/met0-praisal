import React, { useEffect, useState, useMemo } from "react";
import styles from "./LpStore.module.css";

const CORPS = [
  { id: 1000436, name: "Malakim Zealots", faction: "Angel Cartel" },
  { id: 1000437, name: "Commando Guri", faction: "Guristas Pirates" },
];

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

export default function LpStore() {
  const [corpId, setCorpId] = useState(CORPS[0].id);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState("iskPerLpSell");
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");

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

  const filtered = useMemo(() => {
    if (!data?.offers) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.offers;
    return data.offers.filter((o) => o.name.toLowerCase().includes(q));
  }, [data, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
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
        <div className={styles.field}>
          <label className={styles.label}>CORPORATION</label>
          <select
            className={styles.select}
            value={corpId}
            onChange={(e) => setCorpId(parseInt(e.target.value, 10))}
          >
            {CORPS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.faction}
              </option>
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
        <div className={styles.meta}>
          {data && !loading && <span>{filtered.length} / {data.offers.length} offers</span>}
        </div>
      </div>

      {loading && <div className={styles.loading}>FETCHING LP STORE...</div>}
      {error && <div className={styles.error}>⚠ {error}</div>}

      {data && !loading && (
        <div className={styles.wrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thName} onClick={() => handleSort("name")}>ITEM{arrow("name")}</th>
                <th className={styles.thNum} onClick={() => handleSort("quantity")}>QTY{arrow("quantity")}</th>
                <th className={styles.thNum} onClick={() => handleSort("lpCost")}>LP{arrow("lpCost")}</th>
                <th className={styles.thNum} onClick={() => handleSort("iskCost")}>ISK COST{arrow("iskCost")}</th>
                <th className={styles.thNum} onClick={() => handleSort("inputCost")}>INPUTS{arrow("inputCost")}</th>
                <th className={styles.thNum} onClick={() => handleSort("revenueSell")}>SELL VAL{arrow("revenueSell")}</th>
                <th className={styles.thNum} onClick={() => handleSort("profitSell")}>PROFIT (SELL){arrow("profitSell")}</th>
                <th className={`${styles.thNum} ${styles.thHighlight}`} onClick={() => handleSort("iskPerLpSell")}>
                  ISK/LP (SELL){arrow("iskPerLpSell")}
                </th>
                <th className={styles.thNum} onClick={() => handleSort("iskPerLpBuy")}>ISK/LP (BUY){arrow("iskPerLpBuy")}</th>
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
                  <td className={styles.tdNum}>{o.quantity.toLocaleString()}</td>
                  <td className={styles.tdNum}>{o.lpCost.toLocaleString()}</td>
                  <td className={styles.tdNum}>{fmt(o.iskCost)}</td>
                  <td className={styles.tdNum}>{fmt(o.inputCost - o.iskCost)}</td>
                  <td className={`${styles.tdNum} ${styles.sell}`}>{fmt(o.revenueSell)}</td>
                  <td className={`${styles.tdNum} ${o.profitSell >= 0 ? styles.sell : styles.danger}`}>
                    {fmt(o.profitSell)}
                  </td>
                  <td className={`${styles.tdNum} ${styles.highlight} ${o.iskPerLpSell >= 0 ? styles.sell : styles.danger}`}>
                    {fmtIskPerLp(o.iskPerLpSell)}
                  </td>
                  <td className={`${styles.tdNum} ${o.iskPerLpBuy >= 0 ? styles.buy : styles.danger}`}>
                    {fmtIskPerLp(o.iskPerLpBuy)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
