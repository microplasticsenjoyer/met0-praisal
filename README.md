# met0-praisal

> EVE Online Jita 4-4 item appraiser — paste a cargo scan or item list, get live buy/sell prices instantly. Every appraisal gets a shareable link.

**Stack: React + Vite → Cloudflare Pages · Cloudflare Pages Functions · Supabase (Postgres)**

---

## Features

- Paste raw EVE item lists — cargo scan, contract, D-scan, or manual
- Live Jita 4-4 buy (max) and sell (min) prices via [Fuzzwork](https://market.fuzzwork.co.uk/)
- Item name resolution via [EVE ESI](https://esi.evetech.net/)
- Cached item typeIDs (7-day TTL) and prices (15-min TTL) in Supabase — fast repeat lookups
- Every appraisal saved with a unique 6-char slug: `/?a=x7k2p`
- One-click shareable link with copy button
- Sortable results table with per-item and total ISK breakdown
- Unknown items flagged but don't break the appraisal

## Project Structure

```
met0-praisal/
├── functions/
│   └── api/
│       ├── _supabase.js          # Supabase client factory
│       ├── _parser.js            # Item list parser
│       ├── _slug.js              # Slug generator
│       ├── appraise.js           # POST /api/appraise
│       └── appraisal/
│           └── [slug].js         # GET /api/appraisal/:slug
├── src/
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── PasteInput.jsx
│   │   ├── ShareBar.jsx
│   │   ├── Summary.jsx
│   │   └── ResultsTable.jsx
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── supabase/
│   └── migrations/
│       └── 20260429_initial_schema.sql
├── index.html
├── vite.config.js
├── wrangler.toml
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

Build and run locally with Wrangler (runs both Vite + Pages Functions):

```bash
npm run build
npm run dev
```

Visit `http://localhost:8788`.

## Deploying to Cloudflare Pages

### 1. Connect the repo

Go to [Cloudflare Dashboard → Workers & Pages → Create](https://dash.cloudflare.com/) and connect your GitHub repo `microplasticsenjoyer/met0-praisal`.

Build settings:
| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |

### 2. Set the service role secret

In Cloudflare Pages → your project → **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `SUPABASE_SERVICE_KEY` | Your Supabase service role key (mark as **Secret**) |

The `SUPABASE_URL` and `SUPABASE_ANON_KEY` are already set in `wrangler.toml`.

### 3. Deploy

Push to `main` — Cloudflare Pages auto-deploys on every push.

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

`0.1.0`

## License

MIT
