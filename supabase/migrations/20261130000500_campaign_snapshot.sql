create table public.campaign_snapshot (
  id integer primary key check (id = 1),
  sources jsonb not null,
  items_checked integer not null,
  items_matched integer not null,
  checked_at timestamptz not null default now()
);

alter table public.campaign_snapshot enable row level security;
create policy "public campaign directory" on public.campaign_snapshot for select using (true);
grant select on public.campaign_snapshot to anon, authenticated;
grant all on public.campaign_snapshot to service_role;
