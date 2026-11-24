/** Street addresses named in item text, and distances. Pure, unit-tested; geocoding lives in ingest/locate.ts. */

const SUFFIX =
  "Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Expressway|Expwy|Expy|Parkway|Pkwy|Terrace|Ter|Circle|Cir|Highway|Hwy|Square|Sq|Loop|Plaza|Alley";
// "645 W. Fremont Avenue", "1250-1290 Lakeside Dr", "220 Humboldt Court". Street name: 1–4 capitalized words
// (or ordinals like "1st"); house numbers of 2+ digits so "Phase 1 Main Street" doesn't match.
const ADDRESS = new RegExp(
  String.raw`\b(\d{2,6})(?:\s?-\s?\d{1,6})?\s+((?:[NSEW]\.?\s+|North\s+|South\s+|East\s+|West\s+)?(?:(?:[A-Z][A-Za-z'’]+|\d+(?:st|nd|rd|th))\.?\s+){1,4}(?:${SUFFIX})\b\.?)`,
  "g",
);

/** Distinct street addresses in the text, as "number street" (ranges keep their first number). */
export function extractAddresses(text: string | null | undefined, max = 5): string[] {
  if (!text) return [];
  const out = new Map<string, string>();
  for (const m of text.matchAll(ADDRESS)) {
    const address = `${m[1]} ${m[2].replace(/\s+/g, " ").replace(/\.$/, "")}`;
    const key = address.toLowerCase().replace(/[.,]/g, "");
    if (!out.has(key)) out.set(key, address);
    if (out.size >= max) break;
  }
  return [...out.values()];
}

export type Point = { lat: number; lng: number };

/** Great-circle distance in miles. */
export function milesBetween(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

/** "0.3 mi", "1.4 mi", "12 mi". */
export function formatMiles(mi: number): string {
  if (mi < 0.1) return "< 0.1 mi";
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

/** The location nearest to the user, with its distance. */
export function nearest<T extends Point>(home: Point | null, places: T[]): (T & { miles: number }) | null {
  if (!home || !places.length) return null;
  return places.map((p) => ({ ...p, miles: milesBetween(home, p) })).sort((x, y) => x.miles - y.miles)[0];
}
