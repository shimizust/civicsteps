-- Reset stale retry/progress timestamps when claiming an area backfill so newly triggered
-- locations immediately show as queued/in-progress instead of "retry" from an older failure.
create or replace function claim_area_backfill(p_scopes text[])
returns boolean
language sql security invoker set search_path = public as $$
  with claimed as (
    insert into ingest_coverage (scope, requested_at, progress, progress_at, last_error)
    select distinct scope, now(), null, now(), null from unnest(p_scopes) as areas(scope)
    on conflict (scope) do update set
      requested_at = excluded.requested_at,
      progress = case when ingest_coverage.backfilled_at is null then null else 'analyzing' end,
      progress_at = now(),
      last_error = null
    where (ingest_coverage.backfilled_at is null or ingest_coverage.progress = 'analyzing')
      and (ingest_coverage.requested_at is null or ingest_coverage.requested_at < now() - interval '1 hour')
    returning scope
  )
  select exists (select 1 from claimed);
$$;

revoke execute on function claim_area_backfill(text[]) from public, anon, authenticated;
grant execute on function claim_area_backfill(text[]) to service_role;
