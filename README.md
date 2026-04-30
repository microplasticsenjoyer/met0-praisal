# met0-praisal

> EVE Online Jita 4-4 item appraiser — paste a cargo scan or item list, get live buy/sell prices instantly. Every appraisal gets a shareable link.

**Stack: React + Vite → Cloudflare Workers (Static Assets + Pages Functions compiled to `_worker.js`) · Supabase (Postgres)**

---

## Features

**Appraise tab**
- Paste raw EVE item lists — cargo scan, contract, D-scan, or manual
- Live Jita 4-4 buy (max) and sell (min) prices via [Fuzzwork](https://market.fuzzwork.co.uk/)
- Item name resolution via [EVE ESI](https://esi.evetech.net/)
- Cached item typeIDs (7-day TTL) and prices (15-min TTL) in Supabase — fast repeat lookups
- Every appraisal saved with a unique 6-char slug: `/?a=x7k2p`
- One-click shareable link with copy button
- Sortable results table with per-item and total ISK breakdown
- Unknown items flagged but don't break the appraisal

**LP Store tab**
- LP store profitability calculator for FW militia and pirate FW corporations (24th Imperial Crusade, Federal Defence Union, State Protectorate, Tribal Liberation Force, Malakim Zealots, Commando Guri)
- Live offer data via [Fuzzwork LP](https://www.fuzzwork.co.uk/lp/) cached in Supabase (24h TTL)
- Configurable LP price, sales tax %, and manufacturing tax % — apply via Calculate button
- Per-offer ISK/LP for both sell-order and buy-order exit strategies
- Filterable by item name; all columns sortable
- Offers and prices show cache freshness age

## Project Structure

```
met0-praisal/
├── functions/
│   └── api/
│       ├── _supabase.js          # Supabase client factory
│       ├── _parser.js            # Item list parser
│       ├── _slug.js              # Slug generator
│       ├── appraise.js           # POST /api/appraise
│       ├── appraisal/
│       │   └── [slug].js         # GET /api/appraisal/:slug
│       └── lp/
│           ├── _corps.js         # Supported LP store corporations
│           └── [corpId].js       # GET /api/lp/:corpId
├── src/
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── Tabs.jsx
│   │   ├── PasteInput.jsx
│   │   ├── ShareBar.jsx
│   │   ├── Summary.jsx
│   │   ├── ResultsTable.jsx
│   │   └── LpStore.jsx
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── supabase/
│   └── migrations/
│       └── 20260429_initial_schema.sql
├── index.html
├── vite.config.js
├── wrangler.jsonc
└── package.json
```

## Local Development

### Prerequisites

- Node.js 20+
- A [Cloudflare account](https://dash.cloudflare.com/) (free)
- Wrangler CLI (`npm install -g wrangler`)

### Setup

```bash
git clone https://github.com/microplasticsenjoyer/met0-praisal.git
cd met0-praisal
npm install
```

Copy the local secrets file and add your Supabase service role key:

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars and paste your service role key
# Get it from: https://supabase.com/dashboard/project/xvmpasymvtdghgobflgz/settings/api
```

Build and run locally (Vite client + compiled Pages Functions served by Workers Assets):

```bash
npm run build
npm run dev
```

Wrangler will print the local URL (typically `http://localhost:8787`).

## Deploying to Cloudflare Workers

This project is deployed as a **Cloudflare Worker with Static Assets** — the Vite-built client lives in `dist/` and the `functions/` directory is compiled into `dist/_worker.js/` by `wrangler pages functions build`.

### 1. Connect the repo (Workers Builds)

Go to [Cloudflare Dashboard → Workers & Pages → Create](https://dash.cloudflare.com/) and connect your GitHub repo `microplasticsenjoyer/met0-praisal` as a **Worker** (Workers Builds).

Build settings:
| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` *(default)* |

### 2. Set the service role secret

```bash
npx wrangler secret put SUPABASE_SERVICE_KEY
```

(Or in the dashboard → your Worker → **Settings → Variables and Secrets → Add → Secret**.)

The `SUPABASE_URL` and `SUPABASE_ANON_KEY` are already set in `wrangler.jsonc`.

### 3. Deploy

Push to `main` — Workers Builds auto-deploys on every push.

Or deploy manually:

```bash
npm run deploy
```

## Database (Supabase)

- **Project:** `met0-praisal` (`xvmpasymvtdghgobflgz`)
- **Region:** us-east-1
- **Migration:** `supabase/migrations/20260429_initial_schema.sql` (already applied)

### Tables

| Table | Purpose |
|---|---|
| `item_cache` | EVE item name → typeID, 7-day TTL |
| `price_cache` | Jita 4-4 buy/sell prices, 15-min TTL |
| `appraisals` | Each paste submission with totals + slug |
| `appraisal_items` | Line items per appraisal |
| `lp_offers` | LP store offers per corporation, 24h TTL |

RLS is enabled — anon key has read-only access, all writes use the service role key (server-side only).

## Supported Paste Formats

```
# Tab-separated (cargo scan / contract)
Tritanium    100000
100000    Tritanium

# Multiplier format
Damage Control II x5
Tritanium x1000000

# Quantity first
5 Damage Control II

# Plain list
Tritanium
Pyerite
Mexallon

# Comments (ignored)
# this is a comment
// also ignored
```

## Version

`0.2.0`

## License

MIT
