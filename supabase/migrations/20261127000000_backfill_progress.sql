alter table ingest_coverage
  add column progress text check (progress in ('fetching', 'analyzing', 'ready', 'retry')),
  add column progress_at timestamptz,
  add column items_found integer,
  add column items_analyzed integer,
  add column items_failed integer;

grant select (progress, progress_at, items_found, items_analyzed, items_failed)
  on ingest_coverage to anon, authenticated;

-- Claim dispatches atomically across residents of the same area.
create function claim_area_backfill(p_scopes text[])
returns boolean
language sql security invoker set search_path = public as $$
  with claimed as (
    insert into ingest_coverage (scope, requested_at)
    select distinct scope, now() from unnest(p_scopes) as areas(scope)
    on conflict (scope) do update set requested_at = excluded.requested_at
    where (ingest_coverage.backfilled_at is null or ingest_coverage.progress = 'analyzing')
      and (ingest_coverage.requested_at is null or ingest_coverage.requested_at < now() - interval '1 hour')
    returning scope
  )
  select exists (select 1 from claimed);
$$;

revoke execute on function claim_area_backfill(text[]) from public, anon, authenticated;
grant execute on function claim_area_backfill(text[]) to service_role;
