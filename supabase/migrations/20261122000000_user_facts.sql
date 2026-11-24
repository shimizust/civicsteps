-- Facts we learn about a user only when an item depends on them ("Do you ride BART?").
-- The AI mints facts once per item (analyze-v3) and reuses existing ones; impacts point at them via
-- item_analysis.impacts[].applies_if. Matching a user's answers to impacts is plain TS (lib/impact.ts).

-- Shared registry. Server-written (ingest + assess route), world-readable: questions are not personal.
create table facts (
  key text primary key,                       -- 'rides_bart', 'climbs_indian_creek'
  question text not null,                     -- 'Do you ride BART?'
  you_phrase text not null,                   -- 'you ride BART' (fills "Applies to you because …")
  answer_type text not null check (answer_type in ('bool', 'choice')),
  options text[] not null default '{}',       -- choice only
  topics text[] not null default '{}',
  facets text[] not null default '{}',
  source text not null check (source in ('ai', 'agent')),
  canonical_key text references facts (key) on delete set null,  -- set when merged into another fact
  created_from_item uuid references items (id) on delete set null,
  created_at timestamptz not null default now()
);
create index facts_topics_idx on facts using gin (topics);
create index facts_canonical_idx on facts (canonical_key) where canonical_key is not null;

-- A user's answers. value is 'yes'/'no' for bool facts or one of the options; null = "prefer not to say".
-- Keys are registry keys, or 'profile:<demographic>' to remember a declined onboarding question.
create table user_facts (
  user_id uuid not null references auth.users (id) on delete cascade,
  fact_key text not null,
  value text,
  source text not null check (source in ('item', 'feed', 'agent', 'profile')),
  item_id uuid references items (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, fact_key)
);
create trigger user_facts_touch before update on user_facts for each row execute function touch_updated_at();

-- Cache for the on-demand "Ask about my situation" agent, keyed by a hash of the answers it saw.
create table personal_assessments (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references items (id) on delete cascade,
  facts_hash text not null,
  result jsonb not null,
  model text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id, facts_hash)
);
create index personal_assessments_recent_idx on personal_assessments (user_id, item_id, created_at desc);

-- One quota table for every per-user AI feature.
alter table draft_usage add column kind text not null default 'draft';
alter table draft_usage drop constraint draft_usage_pkey;
alter table draft_usage add primary key (user_id, day, kind);

create or replace function consume_ai_quota(p_user uuid, p_kind text, p_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare used integer;
begin
  insert into draft_usage (user_id, day, kind, count) values (p_user, current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update set count = draft_usage.count + 1
  returning count into used;
  if used > p_limit then
    update draft_usage set count = count - 1 where user_id = p_user and day = current_date and kind = p_kind;
    return false;
  end if;
  return true;
end $$;
revoke execute on function consume_ai_quota from public, anon, authenticated;

create or replace function consume_draft_quota(p_user uuid, p_limit integer) returns boolean
language sql security definer set search_path = public as $$
  select consume_ai_quota(p_user, 'draft', p_limit);
$$;
revoke execute on function consume_draft_quota from public, anon, authenticated;

alter table facts enable row level security;
alter table user_facts enable row level security;
alter table personal_assessments enable row level security;

create policy "public read" on facts for select using (true);
create policy "own facts" on user_facts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own assessments" on personal_assessments for select using (user_id = auth.uid());
