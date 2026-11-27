create table saved_zips (
  user_id uuid not null references auth.users (id) on delete cascade,
  zip text not null check (zip ~ '^\d{5}$'),
  lat double precision,
  lng double precision,
  state text,
  jurisdiction_ids text[] not null,
  state_official_ids text[] not null default '{}',
  primary key (user_id, zip)
);

alter table saved_zips enable row level security;
revoke all on saved_zips from anon, authenticated;
grant select on saved_zips to authenticated;
grant select, insert, update on saved_zips to service_role;
create policy "read own saved ZIPs" on saved_zips for select using (user_id = auth.uid());

insert into saved_zips (user_id, zip, lat, lng, state, jurisdiction_ids, state_official_ids)
select p.user_id, p.zip, p.lat, p.lng, p.state, p.jurisdiction_ids, array(
  select uo.official_id from user_officials uo join officials o on o.id = uo.official_id
  where uo.user_id = p.user_id and o.level = 'state'
)
from profiles p
where p.zip is not null;

-- Every existing location consumer reads the active profile and its official links.
-- Update both in one transaction. The profile upsert serializes switches for the same user.
create function activate_zip(
  p_user uuid, p_zip text, p_lat double precision, p_lng double precision, p_state text,
  p_jurisdiction_ids text[], p_state_official_ids text[] default null
)
returns integer
language plpgsql security invoker set search_path = public as $$
declare
  state_ids text[];
  linked integer;
begin
  insert into profiles (user_id, zip, lat, lng, state, jurisdiction_ids)
  values (p_user, p_zip, p_lat, p_lng, p_state, p_jurisdiction_ids)
  on conflict (user_id) do update
  set zip = excluded.zip, lat = excluded.lat, lng = excluded.lng,
      state = excluded.state, jurisdiction_ids = excluded.jurisdiction_ids;

  insert into saved_zips (user_id, zip, lat, lng, state, jurisdiction_ids, state_official_ids)
  values (p_user, p_zip, p_lat, p_lng, p_state, p_jurisdiction_ids, coalesce(p_state_official_ids, '{}'))
  on conflict (user_id, zip) do update
  set lat = excluded.lat, lng = excluded.lng, state = excluded.state,
      jurisdiction_ids = excluded.jurisdiction_ids,
      state_official_ids = coalesce(p_state_official_ids, saved_zips.state_official_ids)
  returning state_official_ids into state_ids;

  delete from user_officials where user_id = p_user;
  insert into user_officials (user_id, official_id)
  select p_user, o.id from officials o
  where (o.level = 'state' and o.id = any (state_ids))
     or (o.level in ('city', 'county') and o.jurisdiction_id = any (p_jurisdiction_ids))
     or (o.level = 'federal' and o.jurisdiction_id = any (p_jurisdiction_ids)
         and (o.jurisdiction_id = 'ocd-division/country:us/state:' || lower(p_state)
              or o.jurisdiction_id like 'ocd-division/country:us/state:' || lower(p_state) || '/cd:%'));
  get diagnostics linked = row_count;
  return linked;
end;
$$;

revoke execute on function activate_zip(uuid, text, double precision, double precision, text, text[], text[])
  from public, anon, authenticated;
grant execute on function activate_zip(uuid, text, double precision, double precision, text, text[], text[])
  to service_role;

-- Recheck residency while holding the same profile locks as activate_zip.
create function sync_council_links(p_jurisdiction text, p_official_ids text[])
returns integer
language plpgsql security invoker set search_path = public as $$
declare
  residents uuid[];
begin
  select array(
    select user_id from profiles where p_jurisdiction = any (jurisdiction_ids) order by user_id for update
  ) into residents;

  delete from user_officials uo using officials o
  where uo.user_id = any (residents) and uo.official_id = o.id and o.jurisdiction_id = p_jurisdiction
    and not (o.id = any (p_official_ids));

  insert into user_officials (user_id, official_id)
  select resident, official from unnest(residents) as resident cross join unnest(p_official_ids) as official
  on conflict do nothing;
  return cardinality(residents);
end;
$$;

revoke execute on function sync_council_links(text, text[]) from public, anon, authenticated;
grant execute on function sync_council_links(text, text[]) to service_role;

-- Keep indexing saved areas even when every user in a state has switched away from it.
create function states_to_ingest()
returns setof text
language sql stable security invoker set search_path = public as $$
  select state from saved_zips where state is not null
  union
  select state from profiles where state is not null and zip is null
  union
  select substr(scope, 7) from ingest_coverage where scope like 'state:%' and backfilled_at is null
  order by 1;
$$;

revoke execute on function states_to_ingest() from public, anon, authenticated;
grant execute on function states_to_ingest() to service_role;
