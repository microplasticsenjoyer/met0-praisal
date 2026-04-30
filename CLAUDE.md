# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

EVE Online Jita 4-4 item appraiser. Users paste a cargo scan or item list; the app resolves item names to typeIDs via EVE ESI, fetches live buy/sell prices from Fuzzwork, saves the result with a unique 6-char slug, and returns a shareable link. A second tab shows LP store profitability for supported pirate FW corporations.

## Commands

```bash
# Install dependencies
npm install

# Build (must run before dev)
npm run build          # vite build + wrangler pages functions build + copy .assetsignore

# Local dev server (Wrangler serves static assets + functions together at localhost:8787)
npm run dev

# Deploy to Cloudflare Workers
npm run deploy
```

**Local secrets** — copy `.dev.vars.example` to `.dev.vars` (git-ignored) and fill in `SUPABASE_SERVICE_KEY` before running dev or build.

There are no tests and no linter configured.

## Architecture

The project was originally a separate Express server + Vite client (see `server/` and `client/` directories). These are **dead code** — the active codebase is:

- **`src/`** — React + Vite frontend (the active client)
- **`functions/api/`** — Cloudflare Pages Functions (compiled to `dist/_worker.js/` by Wrangler)
- **`supabase/migrations/`** — Postgres schema applied to Supabase project `xvmpasymvtdghgobflgz`

`wrangler.jsonc` configures the Worker with static assets from `dist/` (SPA fallback) and the compiled function bundle as `main`.

### API endpoints (functions/api/)

| File | Route | Auth |
|---|---|---|
| `appraise.js` | `POST /api/appraise` | service role (writes) |
| `appraisal/[slug].js` | `GET /api/appraisal/:slug` | anon (reads only) |
| `lp/[corpId].js` | `GET /api/lp/:corpId` | service role (writes cache) |

All functions are Cloudflare Pages Functions with `onRequestPost`/`onRequestGet` exports and receive `{ request, env, params }`.

### Caching pattern

Every external API call goes cache-first through Supabase. The same pattern is repeated in `appraise.js` and `lp/[corpId].js`:

1. Query Supabase for cached rows
2. Filter out stale rows (compare `updated_at` to TTL constant)
3. Fetch missing/stale from external API
4. Upsert fresh rows back to Supabase
5. Return merged result

TTLs: item name→typeID = 7 days · prices = 15 min · LP offers = 24h

### Supabase clients

`functions/api/_supabase.js` exports two factories:
- `getPublicClient(env)` — anon key, used only for reads (slug lookups)
- `getServiceClient(env)` — service role key, used for all writes

`SUPABASE_URL` and `SUPABASE_ANON_KEY` live in `wrangler.jsonc` as plain vars. `SUPABASE_SERVICE_KEY` must be set as a Wrangler secret (`npx wrangler secret put SUPABASE_SERVICE_KEY`).

### Database schema (Supabase)

- `item_cache` — EVE typeID ↔ name, indexed on `name_lower`
- `price_cache` — Jita 4-4 buy/sell prices per typeID; FK to `item_cache(type_id)`
- `appraisals` — each submission (slug, raw input, totals)
- `appraisal_items` — line items per appraisal; FK to `appraisals(id)`
- `lp_offers` — LP store offers per corp, PK is `(corporation_id, offer_id)`

RLS is enabled on all tables. Anon key = SELECT only; service role = all operations.

### URL routing

The app is an SPA. Query params drive state:
- `?a=<slug>` — loads a saved appraisal on mount
- `?tab=lp` — opens the LP Store tab

`window.history.replaceState` is used (no router library).

### Adding a supported LP store corporation

Two places must be updated in sync:
1. `functions/api/lp/_corps.js` — add to `LP_CORPS` object
2. `src/components/LpStore.jsx` — add to the `CORPS` array at the top of the file
