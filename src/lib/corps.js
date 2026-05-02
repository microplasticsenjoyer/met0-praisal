// Shared helper for fetching the supported LP-store corp list from /api/lp/corps.
// Centralises the corp data so the LpStore and CorpStore components don't
// drift from the backend (functions/api/lp/_corps.js).

import { useEffect, useState } from "react";

let corpsPromise = null;

export function fetchCorpGroups() {
  if (!corpsPromise) {
    corpsPromise = fetch("/api/lp/corps")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("corps fetch failed"))))
      .then((j) => j.groups ?? [])
      .catch((err) => {
        corpsPromise = null;
        throw err;
      });
  }
  return corpsPromise;
}

export function useCorpGroups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchCorpGroups()
      .then((g) => { if (!cancelled) { setGroups(g); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const allCorps = groups.flatMap((g) => g.corps);
  return { groups, allCorps, loading, error };
}
