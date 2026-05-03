# met0-praisal

> EVE Online item appraiser & LP-store calculator — paste a cargo scan, get live buy/sell prices, share the link, split the loot. Built for corp manufacturers and FW pilots.

**Stack: React + Vite → Cloudflare Workers (Static Assets + Pages Functions compiled to `_worker.js`) · Supabase (Postgres)**

---

## Features

**Appraise tab**
- Paste raw EVE item lists — cargo scan, contract, D-scan, or manual
- Pick the trading hub: Jita 4-4 (default), Amarr VIII, Dodixie IX-19, Hek VIII-12, or Rens VI-8 — quotes against your actual market
- Live buy (max) and sell (min) prices via [Fuzzwork](https://market.fuzzwork.co.uk/) and item name resolution via [EVE ESI](https://esi.evetech.net/)
- Cached typeIDs (7-day TTL) and Jita prices (30-min TTL) in Supabase
- Every appraisal saved with a 6-char slug: `?a=x7k2p` — one-click shareable link
- Sales tax % + broker fee % inputs; Summary shows post-fee NET totals
- Loot split: enter N ways and every member's share is computed against the post-fee net
- ON MARKET column shows current Jita sell-side depth per item; rows where qty > listed depth get a "low depth" warning ("the headline number is fiction past that point")
- Volume column for cargo m³ totals
- Local appraisal history (browser-only, up to 25 entries) with click-to-open and inline titles like "loot from Tama 2025-W18"
- Unknown items flagged but don't break the appraisal
- Per-IP rate limit on the public POST endpoint, 100k-char input cap

**LP Store tab**
- LP store profitability calculator for FW militia and pirate FW corporations (24th Imperial Crusade, Federal Defence Union, State Protectorate, Tribal Liberation Force, Malakim Zealots, Commando Guri)
- Configurable LP price, sales tax %, and MFG tax % — apply via Calculate button
- MFG SYSTEM picker pre-fills MFG TAX from ESI's live manufacturing cost-index per system (Jita / Perimeter / Amarr / Hek / Rens / etc.)
- Per-offer ISK/LP for both sell-order and buy-order exit strategies
- MULTIBUY button per row copies input materials as a Jita multibuy paste
- Cross-faction filter: items wrongly returned by ESI for a militia (e.g. Federation Navy items in 24th Imperial Crusade) are dropped server-side
- 7-day Jita volume sparkline per item (ESI market history, 24h TTL) — green = rising, red = falling
- SELL VOL colour-tiered by quartile so depth-anomalies are visible at a glance
- Filterable by item name; URL-state persistence (`?tab=lp&corp=1000179&cat=7&q=phased` works as a deep-link)
- Offers and prices show cache freshness age

**Corp LP tab**
- Compute corp-internal LP-store pricing using your acquisition cost + a markup %
- Highlights "great deals" vs Jita sell, plus a top-5 savings banner

**Hauling tab**
- Paste a cargo list, pick a hauling ship, set ISK/m³ haul cost + sales tax %
- Greedy cargo-fill plan ranks items by net ISK/m³ and packs your hold to capacity
- Per-item ✓ (full) or ~N% (partial) markers, cargo-used progress bar, TRIP PROFIT total

## Project Structure

```
met0-praisal/
├── functions/
│   └── api/
│       ├── _supabase.js          # Supabase client factory
│       ├── _parser.js            # Item list parser
│       ├── _slug.js              # Slug generator
│       ├── _stations.js          # Supported trading hubs
│       ├── _rate_limit.js        # Per-IP rate limiter helper
│       ├── stations.js           # GET /api/stations
│       ├── appraise.js           # POST /api/appraise
│       ├── appraisal/
│       │   └── [slug].js         # GET /api/appraisal/:slug
│       ├── industry/
│       │   └── indices.js        # GET /api/industry/indices
│       └── lp/
│           ├── _corps.js         # Supported LP store corps + cross-faction filter
│           ├── corps.js          # GET /api/lp/corps
│           ├── [corpId].js       # GET /api/lp/:corpId
│           └── history.js        # POST /api/lp/history (7-day volume cache)
├── src/
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── Tabs.jsx
│   │   ├── PasteInput.jsx
│   │   ├── StationPicker.jsx
│   │   ├── AppraisalHistory.jsx
│   │   ├── ShareBar.jsx
│   │   ├── Summary.jsx
│   │   ├── ResultsTable.jsx
│   │   ├── Sparkline.jsx
│   │   ├── LpStore.jsx
│   │   ├── CorpStore.jsx
│   │   └── Hauling.jsx
│   ├── lib/
│   │   ├── corps.js              # Shared LP-corp fetch hook
│   │   ├── haulingShips.js       # Hauling ship hold sizes
│   │   └── history.js            # Browser-local appraisal history
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── supabase/
│   └── migrations/               # See ls supabase/migrations/ for the full set
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
| `market_history` | 7-day Jita volume + average per typeID, 24h TTL |
| `industry_indices` | ESI manufacturing cost-index per popular system, 1h TTL |
| `rate_limits` | Per-IP token bucket for /api/appraise (server-side only) |

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

`0.5.1`

## License

MIT
