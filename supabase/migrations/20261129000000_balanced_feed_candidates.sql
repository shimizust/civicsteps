-- Balance feed_candidates() across federal, state, and city sources so long-horizon federal comment
-- periods or busy state/city feeds cannot crowd each other out under the p_limit cap.
create or replace function feed_candidates(p_limit integer default 300)
returns table (
  item jsonb,
  analysis jsonb,
  my_official_ids text[]
)
language sql stable security invoker set search_path = public as $$
  with me as (
    select p.user_id, p.jurisdiction_ids, p.state
    from profiles p where p.user_id = auth.uid()
  ),
  interests as (
    select coalesce(array_agg(distinct t), '{}') as topics,
           coalesce((select array_agg(distinct lower(k)) from user_interests ui2, unnest(ui2.keywords) k
                     where ui2.user_id = auth.uid()), '{}') as keywords
    from user_interests ui, unnest(ui.topic_slugs) t
    where ui.user_id = auth.uid()
  ),
  expanded as (
    -- parent topics count too: picking "public-lands" matches "public-lands/national-parks"
    select i.keywords,
           i.topics || coalesce((select array_agg(slug) from topics where parent_slug = any (i.topics)), '{}') as topics
    from interests i
  ),
  liked as (
    select coalesce(array_agg(distinct t), '{}') as topics
    from item_feedback f join item_analysis fa on fa.item_id = f.item_id, unnest(fa.topics) t
    where f.user_id = auth.uid() and f.relevant
  ),
  mine as (
    select official_id from user_officials where user_id = auth.uid()
  ),
  matched as (
    select it,
           a,
           coalesce((select array_agg(io.official_id) from item_officials io
                     where io.item_id = it.id and io.official_id in (select official_id from mine)), '{}') as my_official_ids,
           row_number() over (
             partition by case
               when it.level in ('city', 'county') then 'city'
               when it.level = 'state' then 'state'
               else it.source
             end
             order by
               case when coalesce(it.comment_deadline, it.event_at) between now() and now() + interval '14 days' then 0 else 1 end,
               case when coalesce(it.comment_deadline, it.event_at) between now() and now() + interval '14 days'
                    then coalesce(it.comment_deadline, it.event_at) end asc nulls last,
               coalesce(it.last_action_at, it.enacted_at) desc nulls last,
               coalesce(it.comment_deadline, it.event_at) asc nulls last,
               it.id asc
           ) as bucket_rank
    from items it
    join item_analysis a on a.item_id = it.id
    cross join me
    cross join expanded e
    cross join liked l
    where (it.level = 'federal' or it.jurisdiction_id = any (me.jurisdiction_ids) or (it.level = 'state' and it.state = me.state))
      and (
        it.comment_deadline > now()
        or it.event_at > now()
        or it.last_action_at > current_date - 45
        or it.enacted_at > current_date - 120
      )
      and (
        a.topics && e.topics
        or a.keywords && e.keywords
        or a.topics && l.topics
        or exists (select 1 from item_feedback f where f.item_id = it.id and f.user_id = auth.uid())
        or exists (select 1 from item_officials io where io.item_id = it.id and io.official_id in (select official_id from mine))
        or a.significance >= 4
        or it.level in ('city', 'county')
      )
  )
  select to_jsonb(m.it) as item,
         to_jsonb(m.a) as analysis,
         m.my_official_ids
  from matched m
  order by m.bucket_rank asc,
           coalesce((m.it).comment_deadline, (m.it).event_at, (m.it).last_action_at::timestamptz, (m.it).enacted_at::timestamptz) desc nulls last
  limit p_limit;
$$;

-- Include recently signed state laws (enacted_at) in active counts, matching feed_candidates() and browse_items().
create or replace function index_counts()
returns table (indexed bigint, in_area bigint, in_area_active bigint)
language sql stable security invoker set search_path = public as $$
  with me as (
    select p.jurisdiction_ids, p.state from profiles p where p.user_id = auth.uid()
  ),
  rows as (
    select (it.level = 'federal' or it.jurisdiction_id = any (me.jurisdiction_ids) or (it.level = 'state' and it.state = me.state)) as in_area,
           (
             it.comment_deadline > now()
             or it.event_at > now()
             or it.last_action_at > current_date - 45
             or it.enacted_at > current_date - 120
           ) as active
    from items it
    join item_analysis a on a.item_id = it.id
    left join me on true
  )
  select count(*),
         count(*) filter (where in_area),
         count(*) filter (where in_area and active)
  from rows;
$$;
