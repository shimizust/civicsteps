-- CivicSteps initial schema
-- Public civic data (topics, jurisdictions, officials, items, analysis) is world-readable.
-- Per-user data is readable/writable only by its owner. Points and badges are written
-- only by the server (service role) so clients cannot award themselves.

create type jurisdiction_level as enum ('city', 'county', 'state', 'federal');
create type item_type as enum ('bill', 'comment_period', 'hearing', 'vote', 'agenda_item', 'opportunity');
create type action_type as enum ('read', 'emailed', 'called', 'commented', 'signed', 'attended', 'shared');
create type draft_kind as enum ('email', 'call_script', 'public_comment');

-- ---------------------------------------------------------------- reference data

create table topics (
  slug text primary key,
  name text not null,
  parent_slug text references topics (slug)
);

create table badges (
  slug text primary key,
  name text not null,
  description text not null,
  icon text not null
);

-- OCD division ids, e.g. ocd-division/country:us/state:co/place:boulder
create table jurisdictions (
  id text primary key,
  level jurisdiction_level not null,
  name text not null,
  state text
);

-- Cities whose council data we ingest from Legistar.
create table local_sources (
  id text primary key,                -- legistar client name, e.g. 'seattle'
  jurisdiction_id text not null references jurisdictions (id),
  name text not null,
  enabled boolean not null default true
);

-- ---------------------------------------------------------------- officials & items

create table officials (
  id text primary key,                -- 'bioguide:X000123', 'ocd-person/...', 'legistar:seattle:42'
  name text not null,
  party text,
  office text not null,               -- 'U.S. Senator', 'State Representative', 'City Councilmember'
  level jurisdiction_level not null,
  jurisdiction_id text,               -- division they represent
  state text,
  photo_url text,
  contacts jsonb not null default '{}'::jsonb,  -- {phones, emails, contact_form_url, website, offices}
  external_ids jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index officials_jurisdiction_idx on officials (jurisdiction_id);

create table items (
  id uuid primary key default gen_random_uuid(),
  source text not null,               -- 'congress', 'openstates', 'regulations', 'federalregister', 'legistar', 'curated'
  external_id text not null,
  type item_type not null,
  level jurisdiction_level not null,
  jurisdiction_id text,
  state text,
  title text not null,
  description text,
  url text,
  action_url text,                   -- where to act: comment form, contact page
  agency text,
  status text,
  introduced_at date,
  last_action_at date,
  last_action text,
  comment_deadline timestamptz,
  event_at timestamptz,
  content_hash text not null,
  analysis_status text not null default 'pending'
    check (analysis_status in ('pending', 'submitted', 'done', 'failed', 'skipped')),
  analysis_batch_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);
create index items_deadline_idx on items (comment_deadline) where comment_deadline is not null;
create index items_event_idx on items (event_at) where event_at is not null;
create index items_last_action_idx on items (last_action_at desc);
create index items_jurisdiction_idx on items (level, jurisdiction_id);
create index items_analysis_status_idx on items (analysis_status);

create table item_analysis (
  item_id uuid primary key references items (id) on delete cascade,
  summary text not null,
  why_it_matters text,
  topics text[] not null default '{}',
  affected_groups text[] not null default '{}',
  keywords text[] not null default '{}',
  significance smallint not null check (significance between 1 and 5),
  arguments_for text[] not null default '{}',
  arguments_against text[] not null default '{}',
  model text not null,
  prompt_version text not null,
  created_at timestamptz not null default now()
);
create index item_analysis_topics_idx on item_analysis using gin (topics);
create index item_analysis_keywords_idx on item_analysis using gin (keywords);

create table item_officials (
  item_id uuid not null references items (id) on delete cascade,
  official_id text not null references officials (id) on delete cascade,
  role text not null check (role in ('sponsor', 'cosponsor', 'committee', 'voted')),
  vote text,
  primary key (item_id, official_id, role)
);
create index item_officials_official_idx on item_officials (official_id);

-- ---------------------------------------------------------------- per-user data

create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  address text,                        -- never sent to the LLM
  lat double precision,
  lng double precision,
  state text,
  jurisdiction_ids text[] not null default '{}',   -- every division the user lives in
  demographics jsonb not null default '{}'::jsonb,
  notify_alerts boolean not null default true,
  notify_digest boolean not null default true,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_officials (
  user_id uuid not null references auth.users (id) on delete cascade,
  official_id text not null references officials (id) on delete cascade,
  primary key (user_id, official_id)
);

-- A topic pick is one row with topic_slugs = [slug]; a pet issue is free text mapped to several topics + keywords.
create table user_interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  topic_slugs text[] not null default '{}',
  keywords text[] not null default '{}',
  is_pet boolean not null default false,
  created_at timestamptz not null default now()
);
create index user_interests_user_idx on user_interests (user_id);

create table drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references items (id) on delete cascade,
  official_id text references officials (id) on delete set null,
  kind draft_kind not null,
  stance text not null,
  personal_note text not null,
  content text not null,
  model text,
  created_at timestamptz not null default now()
);
create index drafts_user_idx on drafts (user_id, created_at desc);

create table user_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid references items (id) on delete cascade,
  official_id text references officials (id) on delete set null,
  type action_type not null,
  created_at timestamptz not null default now(),
  -- Doing the same thing twice (same item, same official) earns nothing extra.
  unique nulls not distinct (user_id, item_id, official_id, type)
);
create index user_actions_user_idx on user_actions (user_id, created_at desc);

create table points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action_id uuid references user_actions (id) on delete cascade,
  points integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index points_ledger_user_idx on points_ledger (user_id);

create table user_badges (
  user_id uuid not null references auth.users (id) on delete cascade,
  badge_slug text not null references badges (slug),
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_slug)
);

create table draft_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

create table notifications_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid references items (id) on delete cascade,
  kind text not null check (kind in ('new_pet_item', 'deadline_soon', 'digest')),
  period text not null default '',     -- e.g. ISO week for digests
  sent_at timestamptz not null default now(),
  unique nulls not distinct (user_id, item_id, kind, period)
);

-- ---------------------------------------------------------------- functions

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger items_touch before update on items for each row execute function touch_updated_at();
create trigger profiles_touch before update on profiles for each row execute function touch_updated_at();

-- Atomically consume one AI draft from today's quota. Service role only.
create or replace function consume_draft_quota(p_user uuid, p_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare used integer;
begin
  insert into draft_usage (user_id, day, count) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set count = draft_usage.count + 1
  returning count into used;
  if used > p_limit then
    update draft_usage set count = count - 1 where user_id = p_user and day = current_date;
    return false;
  end if;
  return true;
end $$;
revoke execute on function consume_draft_quota from public, anon, authenticated;

-- Candidate items for a user's feed. Cheap SQL prefilter; final ranking happens in lib/relevance.ts.
-- An item is a candidate if it is in one of the user's jurisdictions (or federal), is current,
-- and either overlaps the user's topics/keywords, involves one of their officials, or is highly significant.
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
  where (it.level = 'federal' or it.jurisdiction_id = any (me.jurisdiction_ids) or (it.level = 'state' and it.state = me.state))
    and (
      it.comment_deadline > now()
      or it.event_at > now()
      or it.last_action_at > current_date - 45
    )
    and (
      a.topics && e.topics
      or a.keywords && e.keywords
      or exists (select 1 from item_officials io where io.item_id = it.id and io.official_id in (select official_id from mine))
      or a.significance >= 4
      or it.level in ('city', 'county')
    )
  order by coalesce(it.comment_deadline, it.event_at, it.last_action_at::timestamptz) desc
  limit p_limit;
$$;

-- ---------------------------------------------------------------- row level security

alter table topics enable row level security;
alter table badges enable row level security;
alter table jurisdictions enable row level security;
alter table local_sources enable row level security;
alter table officials enable row level security;
alter table items enable row level security;
alter table item_analysis enable row level security;
alter table item_officials enable row level security;
alter table profiles enable row level security;
alter table user_officials enable row level security;
alter table user_interests enable row level security;
alter table drafts enable row level security;
alter table user_actions enable row level security;
alter table points_ledger enable row level security;
alter table user_badges enable row level security;
alter table draft_usage enable row level security;
alter table notifications_sent enable row level security;

-- public read
create policy "public read" on topics for select using (true);
create policy "public read" on badges for select using (true);
create policy "public read" on jurisdictions for select using (true);
create policy "public read" on local_sources for select using (true);
create policy "public read" on officials for select using (true);
create policy "public read" on items for select using (true);
create policy "public read" on item_analysis for select using (true);
create policy "public read" on item_officials for select using (true);

-- owner read/write
create policy "own profile" on profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own officials" on user_officials for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own interests" on user_interests for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own drafts" on drafts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own actions read" on user_actions for select using (user_id = auth.uid());
create policy "own actions insert" on user_actions for insert with check (user_id = auth.uid());

-- owner read only (server writes)
create policy "own points" on points_ledger for select using (user_id = auth.uid());
create policy "own badges" on user_badges for select using (user_id = auth.uid());
create policy "own usage" on draft_usage for select using (user_id = auth.uid());
