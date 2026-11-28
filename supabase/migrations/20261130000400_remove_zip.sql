grant delete on saved_zips to service_role;

-- Remove one of the user's saved ZIP codes. If it was active, switch the profile to another saved ZIP
-- (or clear the location if none remain) and re-sync official links under the same profile lock as activate_zip.
create function remove_zip(p_user uuid, p_zip text)
returns table (
  removed boolean,
  was_active boolean,
  next_zip text,
  next_state text,
  next_jurisdiction_ids text[]
)
language plpgsql security invoker set search_path = public as $$
declare
  prof profiles%rowtype;
  has_profile boolean := false;
  deleted_count integer;
  fallback saved_zips%rowtype;
begin
  select p.* into prof from profiles p where p.user_id = p_user for update;
  has_profile := found;

  delete from saved_zips sz where sz.user_id = p_user and sz.zip = p_zip;
  get diagnostics deleted_count = row_count;

  if deleted_count = 0 then
    if has_profile then
      return query select false, false, prof.zip, prof.state, coalesce(prof.jurisdiction_ids, '{}'::text[]);
    else
      return query select false, false, null::text, null::text, '{}'::text[];
    end if;
    return;
  end if;

  if not has_profile or prof.zip is distinct from p_zip then
    if has_profile then
      return query select true, false, prof.zip, prof.state, coalesce(prof.jurisdiction_ids, '{}'::text[]);
    else
      return query select true, false, null::text, null::text, '{}'::text[];
    end if;
    return;
  end if;

  select sz.* into fallback
  from saved_zips sz
  where sz.user_id = p_user
  order by sz.zip asc
  limit 1;

  if found then
    update profiles p
    set zip = fallback.zip,
        lat = fallback.lat,
        lng = fallback.lng,
        state = fallback.state,
        jurisdiction_ids = fallback.jurisdiction_ids
    where p.user_id = p_user;

    delete from user_officials uo where uo.user_id = p_user;
    insert into user_officials (user_id, official_id)
    select p_user, o.id from officials o
    where (o.level = 'state' and o.id = any (fallback.state_official_ids))
       or (o.level in ('city', 'county') and o.jurisdiction_id = any (fallback.jurisdiction_ids))
       or (o.level = 'federal' and o.jurisdiction_id = any (fallback.jurisdiction_ids)
           and fallback.state is not null
           and (o.jurisdiction_id = 'ocd-division/country:us/state:' || lower(fallback.state)
                or o.jurisdiction_id like 'ocd-division/country:us/state:' || lower(fallback.state) || '/cd:%'));

    return query select true, true, fallback.zip, fallback.state, fallback.jurisdiction_ids;
  else
    update profiles p
    set zip = null,
        lat = null,
        lng = null,
        state = null,
        jurisdiction_ids = '{}'::text[]
    where p.user_id = p_user;

    delete from user_officials uo where uo.user_id = p_user;

    return query select true, true, null::text, null::text, '{}'::text[];
  end if;
end;
$$;

revoke execute on function remove_zip(uuid, text) from public, anon, authenticated;
grant execute on function remove_zip(uuid, text) to service_role;
