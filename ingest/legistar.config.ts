/**
 * Cities whose council data is pulled from the Legistar Web API (https://webapi.legistar.com).
 * `client` is the subdomain of the city's Legistar site, e.g. seattle.legistar.com → "seattle".
 * Add your city here, then run `npm run gen:seed` and `npm run db:reset`.
 */
export type LocalSource = { client: string; name: string; state: string; jurisdictionId: string };

export const LOCAL_SOURCES: LocalSource[] = [
  { client: "seattle", name: "Seattle", state: "WA", jurisdictionId: "ocd-division/country:us/state:wa/place:seattle" },
  { client: "sunnyvaleca", name: "Sunnyvale", state: "CA", jurisdictionId: "ocd-division/country:us/state:ca/place:sunnyvale" },
];

/** ingest_coverage scopes: which areas have had their recent history backfilled. */
export const stateScope = (state: string) => `state:${state.toUpperCase()}`;
export const citySourceScope = (src: LocalSource) => `legistar:${src.client}`;
