-- Where an item is about, when it names street addresses ("Location: 645 W. Fremont Avenue"): mostly city
-- planning items. Addresses are pulled from the item text and geocoded during ingest (ingest/locate.ts),
-- so the item page can map the site next to the user's ZIP.
create table item_locations (
  item_id uuid not null references items (id) on delete cascade,
  address text not null,               -- as written in the item, e.g. '645 W. Fremont Avenue'
  matched_address text,                -- as the geocoder matched it
  lat double precision not null,
  lng double precision not null,
  primary key (item_id, address)
);

-- Set once an item's text has been checked for addresses; reset when the text changes.
alter table items add column located_at timestamptz;

alter table item_locations enable row level security;
create policy "public read" on item_locations for select using (true);
