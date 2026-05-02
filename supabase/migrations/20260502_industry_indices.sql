-- ESI manufacturing cost-index cache for popular industry systems.
-- Refreshed at most hourly from /industry/systems/ via /api/industry/indices.

create table if not exists industry_indices (
  system_id            integer     primary key,
  system_name          text        not null,
  manufacturing_index  numeric(8, 6) not null default 0,
  updated_at           timestamptz not null default now()
);

alter table industry_indices enable row level security;

create policy "public read industry_indices"
  on industry_indices for select to anon using (true);

create policy "service write industry_indices"
  on industry_indices for all to service_role using (true) with check (true);
