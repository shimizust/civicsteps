/**
 * ZIP → a point inside it → every political division that point is in, via the free
 * US Census Geocoder (no API key). Districts are expressed as OCD-style division ids.
 *
 * We only ask for a ZIP, so we look up the Census interior point of its ZIP Code
 * Tabulation Area (bundled in zcta.data.ts) and resolve districts there. A ZIP can cross
 * district or city lines; the point picks one side.
 */
import { ZCTA_POINTS } from "./zcta.data";

export type Districts = {
  zip: string;
  lat: number;
  lng: number;
  state: string; // "CO"
  cd: number | null; // congressional district; 0 = at-large
  sldu: string | null;
  sldl: string | null;
  county: string | null;
  place: string | null;
  jurisdictionIds: string[];
};

const OCD = "ocd-division/country:us";
export const ocdSlug = (name: string) =>
  name.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s-]+/g, "_");

type Geo = { GEOID: string; NAME: string; BASENAME: string; STUSAB?: string };

function first(geos: Record<string, Geo[]>, pattern: RegExp): Geo | null {
  const key = Object.keys(geos).find((k) => pattern.test(k));
  return key && geos[key]?.length ? geos[key][0] : null;
}

/** Strip leading zeros from district names like "006" but keep names like "4A" or "Chittenden-1". */
const districtName = (g: Geo | null) => (g ? g.BASENAME.replace(/^0+(?=\w)/, "") : null);

let points: Map<string, [number, number]> | null = null;

/** Interior point of a 5-digit ZIP's tabulation area, or null if the Census has none (e.g. PO-box-only ZIPs). */
export function zipPoint(zip: string): { lat: number; lng: number } | null {
  if (!points) {
    points = new Map();
    for (const line of ZCTA_POINTS.split("\n")) {
      const [z, lat, lng] = line.split(" ");
      points.set(z, [Number(lat), Number(lng)]);
    }
  }
  const p = points.get(zip);
  return p ? { lat: p[0], lng: p[1] } : null;
}

/** Parses a Census geographies/coordinates response for the point we sent. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseCensusResponse(json: any, at: { zip: string; lat: number; lng: number }): Districts | null {
  const geos: Record<string, Geo[]> | undefined = json?.result?.geographies;
  if (!geos) return null;

  const stateGeo = first(geos, /^States$/);
  const state = stateGeo?.STUSAB;
  if (!state) return null;
  const st = state.toLowerCase();

  const cdGeo = first(geos, /Congressional Districts/);
  const cd = cdGeo ? parseInt(cdGeo.GEOID.slice(2), 10) : null;
  const sldu = districtName(first(geos, /Legislative Districts - Upper/));
  const sldl = districtName(first(geos, /Legislative Districts - Lower/));
  const countyGeo = first(geos, /^Counties$/);
  const placeGeo = first(geos, /^Incorporated Places$/);
  const county = countyGeo?.NAME ?? null;
  const place = placeGeo?.BASENAME ?? null;

  const base = `${OCD}/state:${st}`;
  const ids = [OCD, base];
  if (cd !== null) ids.push(`${base}/cd:${cd}`);
  if (sldu) ids.push(`${base}/sldu:${ocdSlug(sldu)}`);
  if (sldl) ids.push(`${base}/sldl:${ocdSlug(sldl)}`);
  if (county) ids.push(`${base}/county:${ocdSlug(county.replace(/ (County|Parish|Borough)$/i, ""))}`);
  if (place) ids.push(`${base}/place:${ocdSlug(place)}`);

  return {
    zip: at.zip,
    lat: at.lat,
    lng: at.lng,
    state,
    cd,
    sldu,
    sldl,
    county,
    place,
    jurisdictionIds: ids,
  };
}

/** Returns null when the ZIP isn't a known residential ZIP. Throws if the Census service is down. */
export async function geocodeZip(zip: string): Promise<Districts | null> {
  const pt = zipPoint(zip);
  if (!pt) return null;
  const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/coordinates");
  url.search = new URLSearchParams({
    x: String(pt.lng),
    y: String(pt.lat),
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    layers: "all",
    format: "json",
  }).toString();
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Census geocoder ${res.status}`);
  return parseCensusResponse(await res.json(), { zip, ...pt });
}
