/**
 * Address → coordinates + every political division the address is in, via the free
 * US Census Geocoder (no API key). Districts are expressed as OCD-style division ids.
 */

export type Districts = {
  matchedAddress: string;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseCensusResponse(json: any): Districts | null {
  const match = json?.result?.addressMatches?.[0];
  if (!match) return null;
  const geos: Record<string, Geo[]> = match.geographies ?? {};

  const stateGeo = first(geos, /^States$/);
  const state = stateGeo?.STUSAB ?? match.addressComponents?.state;
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
    matchedAddress: match.matchedAddress,
    lat: match.coordinates.y,
    lng: match.coordinates.x,
    state,
    cd,
    sldu,
    sldl,
    county,
    place,
    jurisdictionIds: ids,
  };
}

export async function geocodeAddress(address: string): Promise<Districts | null> {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress");
  url.search = new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    layers: "all",
    format: "json",
  }).toString();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Census geocoder ${res.status}`);
  return parseCensusResponse(await res.json());
}
