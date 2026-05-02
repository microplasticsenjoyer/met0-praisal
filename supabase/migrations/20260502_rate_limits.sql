-- Per-IP rate-limit ledger for write endpoints (currently /api/appraise).
-- One row per IP; the worker reads and atomically updates `tokens` /
-- `window_started`. Cleaned up by a periodic delete in the same upsert.

create table if not exists rate_limits (
  ip              text         primary key,
  tokens          integer      not null default 0,
  window_started  timestamptz  not null default now(),
  updated_at      timestamptz  not null default now()
);

create index if not exists idx_rate_limits_window_started
  on rate_limits (window_started);

alter table rate_limits enable row level security;

-- Service role only — no anon access (the table is purely server-side).
create policy "service write rate_limits"
  on rate_limits for all to service_role using (true) with check (true);
