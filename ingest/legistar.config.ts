/**
 * Cities whose council data is pulled from the Legistar Web API (https://webapi.legistar.com).
 * `client` is the subdomain of the city's Legistar site, e.g. seattle.legistar.com → "seattle".
 * Add your city here, then run `npm run gen:seed` and `npm run db:reset`.
 */
export type LocalSource = {
  client: string;
  name: string;
  state: string;
  jurisdictionId: string;
  /** Verified portrait URLs keyed by Legistar person ID. */
  photos?: Readonly<Partial<Record<number, string>>>;
};

const seattlePhotos = "https://www.seattle.gov/images/Council/Citywide%20Circle%20Headshots/";
const sunnyvalePhotos = "https://images.clubexpress.com/604588/graphics/";

export const LOCAL_SOURCES: LocalSource[] = [
  {
    client: "seattle",
    name: "Seattle",
    state: "WA",
    jurisdictionId: "ocd-division/country:us/state:wa/place:seattle",
    // City roster: https://www.seattle.gov/elected-officials
    photos: {
      664: seattlePhotos + "council_struass_circle.jpg", // Dan Strauss
      763: seattlePhotos + "council_saka_circle.jpg", // Rob Saka
      764: seattlePhotos + "council_hollingsworth_circle.jpg", // Joy Hollingsworth
      765: seattlePhotos + "council_rivera_circle.jpg", // Maritza Rivera
      767: seattlePhotos + "council_kettle_circle.jpg", // Robert Kettle
      810: seattlePhotos + "council_rinck_154x154.jpg", // Alexis Mercedes Rinck
      842: seattlePhotos + "council-lin_154x154.jpg", // Eddie Lin
      844: seattlePhotos + "council-foster_154x154.jpg", // Dionne Foster
      889: seattlePhotos + "council-jenks_154x154.jpg", // Nilu Jenks
    },
  },
  {
    client: "sunnyvaleca",
    name: "Sunnyvale",
    state: "CA",
    jurisdictionId: "ocd-division/country:us/state:ca/place:sunnyvale",
    // League of Women Voters of Cupertino-Sunnyvale roster.
    // https://lwvcs.clubexpress.com/content.aspx?club_id=604588&module_id=514297&page_id=22
    photos: {
      463: sunnyvalePhotos + "Larry_Klein_2022_279580699.png",
      645: sunnyvalePhotos + "Richard_Mehlinger_2022_1723210329.png",
      738: sunnyvalePhotos + "Murali_Srinivasan_2022_1814898840.png",
      757: sunnyvalePhotos + "Linda_Sell_2022_647469113.png",
      777: sunnyvalePhotos + "Alysa_Cisneros_2022_4423544.png",
      897: sunnyvalePhotos + "Charlsie_Chang_2024_801695636.png",
      943: sunnyvalePhotos + "Eileen_Le_2022_1481755288.png",
    },
  },
];

/** ingest_coverage scopes: which areas have had their recent history backfilled. */
export const stateScope = (state: string) => `state:${state.toUpperCase()}`;
export const citySourceScope = (src: LocalSource) => `legistar:${src.client}`;
