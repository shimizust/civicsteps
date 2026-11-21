-- Short headline + per-facet impacts ("how this affects you"), produced once per item by analyze-v2.
-- feed_candidates() returns to_jsonb(item_analysis), so it picks these up without changes.
alter table item_analysis
  add column if not exists headline text,
  add column if not exists impacts jsonb not null default '[]'::jsonb;
