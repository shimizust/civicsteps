/**
 * Maps city and county items to the street addresses they name (mostly planning items: "to demolish the
 * existing office building at 645 W. Fremont Avenue..."), via the free US Census Geocoder. Runs on items
 * whose text hasn't been checked yet (items.located_at is null; reset when the text changes).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { extractAddresses } from "@/lib/locations";
import { LOCAL_SOURCES } from "./legistar.config";

type DB = SupabaseClient<Database>;

type CensusMatch = { matchedAddress: string; coordinates: { x: number; y: number }; addressComponents: { state: string } };

/** One address in a city, or null if the Census can't place it. Throws if the service is down. */
export async function geocodeAddress(address: string, city: string | null, state: string) {
  const u = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  u.search = new URLSearchParams({
    address: [address, city, state].filter(Boolean).join(", "),
    benchmark: "Public_AR_Current",
    format: "json",
  }).toString();
  const res = await fetch(u, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Census geocoder ${res.status}`);
  const json = (await res.json()) as { result?: { addressMatches?: CensusMatch[] } };
  // A match in another state means the city was ignored: not our address.
  const m = json.result?.addressMatches?.find((a) => a.addressComponents.state === state);
  return m ? { matched_address: m.matchedAddress, lat: m.coordinates.y, lng: m.coordinates.x } : null;
}

const cityByJurisdiction = new Map(LOCAL_SOURCES.map((s) => [s.jurisdictionId, s.name]));

export async function locateItems(db: DB, log: (...m: unknown[]) => void, limit = 2000) {
  const { data: items, error } = await db
    .from("items")
    .select("id, title, description, jurisdiction_id, state")
    .in("level", ["city", "county"])
    .is("located_at", null)
    .limit(limit);
  if (error) throw error;

  let located = 0;
  let addresses = 0;
  for (const item of items) {
    const found = extractAddresses(`${item.title}\n${item.description ?? ""}`);
    const rows: Database["public"]["Tables"]["item_locations"]["Insert"][] = [];
    if (found.length && item.state) {
      const city = (item.jurisdiction_id && cityByJurisdiction.get(item.jurisdiction_id)) ?? null;
      for (const address of found) {
        const hit = await geocodeAddress(address, city, item.state);
        if (hit) rows.push({ item_id: item.id, address, ...hit });
      }
    }
    // Replace whatever an older version of the text pointed at.
    const { error: delErr } = await db.from("item_locations").delete().eq("item_id", item.id);
    if (delErr) throw delErr;
    if (rows.length) {
      const { error: insErr } = await db.from("item_locations").insert(rows);
      if (insErr) throw insErr;
      located++;
      addresses += rows.length;
    }
    const { error: upErr } = await db.from("items").update({ located_at: new Date().toISOString() }).eq("id", item.id);
    if (upErr) throw upErr;
  }
  log(`locations: checked ${items.length} items, mapped ${addresses} addresses on ${located}`);
}
