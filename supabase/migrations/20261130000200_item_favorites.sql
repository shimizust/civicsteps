-- Issues the user explicitly favorited to keep following up on (distinct from "Relevant / Not relevant" feed votes).
-- Stores a snapshot of the item's state when last checked so we can highlight status/deadline/action updates.
create table item_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references items (id) on delete cascade,
  source text not null check (source in ('feed', 'browse', 'item', 'favorites')),
  last_seen_status text,
  last_seen_action text,
  last_seen_action_at date,
  last_seen_enacted_at date,
  last_seen_deadline timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create index item_favorites_user_idx on item_favorites (user_id, created_at desc);

alter table item_favorites enable row level security;
create policy "own favorites" on item_favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Allow favorite follow-up alerts in notifications_sent.
alter table notifications_sent drop constraint if exists notifications_sent_kind_check;
alter table notifications_sent add constraint notifications_sent_kind_check
  check (kind in ('new_pet_item', 'deadline_soon', 'digest', 'favorite_update'));

-- Keep favorited items coming through feed_candidates regardless of age, area, or p_limit crowding,
-- and also treat favorited items as positive topic signals alongside relevant votes.
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
  favs as (
    select item_id from item_favorites where user_id = auth.uid()
  ),
  liked as (
    select coalesce(array_agg(distinct t), '{}') as topics
    from (
      select item_id from item_feedback where user_id = auth.uid() and relevant
      union
      select item_id from item_favorites where user_id = auth.uid()
    ) pos
    join item_analysis fa on fa.item_id = pos.item_id, unnest(fa.topics) t
  ),
  mine as (
    select official_id from user_officials where user_id = auth.uid()
  ),
  matched as (
    select it,
           a,
           coalesce((select array_agg(io.official_id) from item_officials io
                     where io.item_id = it.id and io.official_id in (select official_id from mine)), '{}') as my_official_ids,
           (it.id in (select item_id from favs)) as is_fav,
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
    where it.id in (select item_id from favs)
       or (
         (it.level = 'federal' or it.jurisdiction_id = any (me.jurisdiction_ids) or (it.level = 'state' and it.state = me.state))
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
  )
  select to_jsonb(m.it) as item,
         to_jsonb(m.a) as analysis,
         m.my_official_ids
  from matched m
  order by m.is_fav desc,
           m.bucket_rank asc,
           coalesce((m.it).comment_deadline, (m.it).event_at, (m.it).last_action_at::timestamptz, (m.it).enacted_at::timestamptz) desc nulls last
  limit p_limit;
$$;
