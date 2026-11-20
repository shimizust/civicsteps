/**
 * Elected officials from free sources:
 *  - Federal: unitedstates/congress-legislators (loaded nightly into `officials`)
 *  - State:   Open States /people.geo (looked up per user at onboarding)
 *  - City:    Legistar council members (see ingest/legistar.ts)
 */
import type { Database } from "@/lib/supabase/database.types";

export type OfficialRow = Database["public"]["Tables"]["officials"]["Insert"];
export type Contacts = {
  phones?: string[];
  emails?: string[];
  contact_form_url?: string;
  website?: string;
  offices?: { name: string; address?: string; phone?: string }[];
};

const OCD = "ocd-division/country:us";
const LEGISLATORS_URL = "https://unitedstates.github.io/congress-legislators/legislators-current.json";

// ---------------------------------------------------------------- federal

type Legislator = {
  id: { bioguide: string };
  name: { official_full?: string; first: string; last: string };
  terms: {
    type: "sen" | "rep";
    state: string;
    district?: number;
    party?: string;
    url?: string;
    contact_form?: string;
    address?: string;
    phone?: string;
  }[];
};

export function federalOfficialFromLegislator(p: Legislator): OfficialRow {
  const t = p.terms[p.terms.length - 1];
  const st = t.state.toLowerCase();
  const isSen = t.type === "sen";
  const contacts: Contacts = {
    phones: t.phone ? [t.phone] : [],
    website: t.url,
    contact_form_url: t.contact_form ?? t.url,
    offices: t.address ? [{ name: "Washington, DC office", address: t.address, phone: t.phone }] : [],
  };
  return {
    id: `bioguide:${p.id.bioguide}`,
    name: p.name.official_full ?? `${p.name.first} ${p.name.last}`,
    party: t.party ?? null,
    office: isSen ? "U.S. Senator" : t.district === 0 ? "U.S. Representative (At-Large)" : "U.S. Representative",
    level: "federal",
    jurisdiction_id: isSen ? `${OCD}/state:${st}` : `${OCD}/state:${st}/cd:${t.district ?? 0}`,
    state: t.state,
    photo_url: `https://unitedstates.github.io/images/congress/225x275/${p.id.bioguide}.jpg`,
    contacts,
    external_ids: { bioguide: p.id.bioguide },
    updated_at: new Date().toISOString(),
  };
}

export async function fetchFederalOfficials(): Promise<OfficialRow[]> {
  const res = await fetch(LEGISLATORS_URL);
  if (!res.ok) throw new Error(`congress-legislators ${res.status}`);
  const people = (await res.json()) as Legislator[];
  return people.map(federalOfficialFromLegislator);
}

/** OCD ids of the federal seats that represent a user, given their jurisdiction ids. */
export function federalSeatIds(state: string, cd: number | null): string[] {
  const base = `${OCD}/state:${state.toLowerCase()}`;
  return cd === null ? [base] : [base, `${base}/cd:${cd}`];
}

// ---------------------------------------------------------------- state (Open States)

type OSPerson = {
  id: string;
  name: string;
  party?: string;
  image?: string;
  email?: string;
  openstates_url?: string;
  current_role?: { title?: string; org_classification?: string; district?: string; division_id?: string };
  jurisdiction?: { classification?: string; name?: string };
  offices?: { name?: string; classification?: string; address?: string; voice?: string }[];
  links?: { url: string; note?: string }[];
};

export function stateOfficialFromOpenStates(p: OSPerson, state: string): OfficialRow | null {
  if (p.jurisdiction?.classification !== "state") return null;
  const role = p.current_role ?? {};
  const chamber = role.org_classification;
  const office =
    role.title && role.title !== "Senator" && role.title !== "Representative"
      ? `State ${role.title}`
      : chamber === "upper"
        ? "State Senator"
        : "State Representative";
  const offices = (p.offices ?? []).map((o) => ({
    name: o.name ?? (o.classification === "capitol" ? "Capitol office" : "District office"),
    address: o.address,
    phone: o.voice,
  }));
  return {
    id: p.id,
    name: p.name,
    party: p.party ?? null,
    office: role.district ? `${office}, District ${role.district}` : office,
    level: "state",
    jurisdiction_id: role.division_id ?? `${OCD}/state:${state.toLowerCase()}`,
    state,
    photo_url: p.image || null,
    contacts: {
      emails: p.email ? [p.email] : [],
      phones: offices.map((o) => o.phone).filter((x): x is string => !!x),
      website: p.links?.[0]?.url ?? p.openstates_url,
      offices,
    } satisfies Contacts,
    external_ids: { openstates: p.id },
    updated_at: new Date().toISOString(),
  };
}

export async function fetchStateOfficials(lat: number, lng: number, state: string): Promise<OfficialRow[]> {
  const key = process.env.OPENSTATES_API_KEY;
  if (!key) return [];
  const url = new URL("https://v3.openstates.org/people.geo");
  url.search = new URLSearchParams({ lat: String(lat), lng: String(lng) }).toString();
  url.searchParams.append("include", "offices");
  url.searchParams.append("include", "links");
  const res = await fetch(url, { headers: { "X-API-KEY": key }, cache: "no-store" });
  if (!res.ok) throw new Error(`Open States people.geo ${res.status}`);
  const json = (await res.json()) as { results: OSPerson[] };
  return json.results.map((p) => stateOfficialFromOpenStates(p, state)).filter((x): x is OfficialRow => !!x);
}

export const contactsOf = (o: { contacts: unknown }) => (o.contacts ?? {}) as Contacts;
