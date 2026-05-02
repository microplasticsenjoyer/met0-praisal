-- Track which trading hub each appraisal was priced against. Default to
-- Jita 4-4 for backwards compatibility with rows created before this column.
alter table appraisals
  add column if not exists station_id integer not null default 60003760;
