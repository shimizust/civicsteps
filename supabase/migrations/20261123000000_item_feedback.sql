-- "Is this relevant to you?" votes. They tune the feed in plain TS (lib/relevance.ts):
-- a vote forces that item in or out, and items sharing its topics get nudged up or down.
create table item_feedback (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references items (id) on delete cascade,
  relevant boolean not null,
  source text not null check (source in ('feed', 'browse', 'item')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create trigger item_feedback_touch before update on item_feedback for each row execute function touch_updated_at();

alter table item_feedback enable row level security;
create policy "own feedback" on item_feedback for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Same as before, plus: items the user voted on always come through (the scorer drops "not relevant" ones),
-- and so do items sharing a topic with ones they marked relevant.
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
  )
  select to_jsonb(it) as item,
         to_jsonb(a) as analysis,
         coalesce((select array_agg(io.official_id) from item_officials io
                   where io.item_id = it.id and io.official_id in (select official_id from mine)), '{}') as my_official_ids
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
  order by coalesce(it.comment_deadline, it.event_at, it.last_action_at::timestamptz) desc
  limit p_limit;
$$;

-- Everything indexed, for the Browse page: searchable, with whether it's in the user's area and still active
-- (the two hard filters feed_candidates applies before any interest matching) and the user's vote.
create or replace function browse_items(
  p_query text default null,
  p_level text default null,
  p_scope text default 'area',   -- 'area' | 'all'
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  item jsonb,
  analysis jsonb,
  my_official_ids text[],
  in_area boolean,
  active boolean,
  relevant boolean,
  total_count bigint
)
language sql stable security invoker set search_path = public as $$
  with me as (
    select p.jurisdiction_ids, p.state from profiles p where p.user_id = auth.uid()
  ),
  mine as (
    select official_id from user_officials where user_id = auth.uid()
  ),
  q as (
    select nullif(trim(p_query), '') as text
  ),
  rows as (
    select it, a,
           coalesce(it.level = 'federal' or it.jurisdiction_id = any (me.jurisdiction_ids) or (it.level = 'state' and it.state = me.state), false) as in_area,
           coalesce(it.comment_deadline > now() or it.event_at > now() or it.last_action_at > current_date - 45, false) as active
    from items it
    join item_analysis a on a.item_id = it.id
    cross join me
    cross join q
    where (p_level is null or it.level::text = p_level or (p_level = 'city' and it.level = 'county'))
      and (
        q.text is null
        or to_tsvector('english', concat_ws(' ', it.title, a.headline, a.summary, it.agency, array_to_string(a.keywords, ' ')))
           @@ websearch_to_tsquery('english', q.text)
        or it.title ilike '%' || q.text || '%'
        or a.headline ilike '%' || q.text || '%'
      )
  )
  select to_jsonb(r.it), to_jsonb(r.a),
         coalesce((select array_agg(io.official_id) from item_officials io
                   where io.item_id = (r.it).id and io.official_id in (select official_id from mine)), '{}'),
         r.in_area,
         r.active,
         (select f.relevant from item_feedback f where f.item_id = (r.it).id and f.user_id = auth.uid()),
         count(*) over ()
  from rows r
  where p_scope = 'all' or r.in_area
  order by r.active desc, coalesce((r.it).comment_deadline, (r.it).event_at, (r.it).last_action_at::timestamptz) desc nulls last
  limit least(p_limit, 100) offset greatest(p_offset, 0);
$$;

-- Counts for the feed header: how much is indexed, and how much of it is in the user's area and active.
create or replace function index_counts()
returns table (indexed bigint, in_area bigint, in_area_active bigint)
language sql stable security invoker set search_path = public as $$
  with me as (
    select p.jurisdiction_ids, p.state from profiles p where p.user_id = auth.uid()
  ),
  rows as (
    select (it.level = 'federal' or it.jurisdiction_id = any (me.jurisdiction_ids) or (it.level = 'state' and it.state = me.state)) as in_area,
           (it.comment_deadline > now() or it.event_at > now() or it.last_action_at > current_date - 45) as active
    from items it
    join item_analysis a on a.item_id = it.id
    left join me on true
  )
  select count(*),
         count(*) filter (where in_area),
         count(*) filter (where in_area and active)
  from rows;
$$;
