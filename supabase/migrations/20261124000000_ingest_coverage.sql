-- Which areas have had their recent history pulled in. The nightly job only fetches the last couple of
-- days, so the first time a user shows up in a new state or Legistar city, ingestion backfills its history
-- once (ingest/run.ts) and records it here. Scopes: 'state:CA' (Open States), 'legistar:seattle' (council).
create table ingest_coverage (
  scope text primary key,
  requested_at timestamptz,          -- last time a ZIP lookup asked for this area (throttles backfill triggers)
  backfilled_at timestamptz,         -- null until a backfill has succeeded
  last_error text
);

alter table ingest_coverage enable row level security;
-- Written by the server (service role) only. Anyone may see whether an area is covered yet,
-- but not when someone last asked for it.
create policy "public read" on ingest_coverage for select using (true);
revoke select on ingest_coverage from anon, authenticated;
grant select (scope, backfilled_at) on ingest_coverage to anon, authenticated;
