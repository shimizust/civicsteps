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
const DISTRICT_OFFICES_URL = "https://unitedstates.github.io/congress-legislators/legislators-district-offices.json";

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

export type DistrictOffice = {
  id?: string;
  address?: string;
  suite?: string;
  building?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
};

type DistrictOfficesEntry = {
  id: { bioguide: string };
  offices?: DistrictOffice[];
};

function formatDistrictAddress(o: DistrictOffice): string | undefined {
  const street = [o.building, o.address, o.suite].filter(Boolean).join(", ");
  const cityState = [o.city, o.state].filter(Boolean).join(", ");
  const tail = [cityState, o.zip].filter(Boolean).join(" ");
  return [street, tail].filter(Boolean).join(", ") || undefined;
}

export function federalOfficialFromLegislator(p: Legislator, districtOffices: DistrictOffice[] = []): OfficialRow {
  const t = p.terms[p.terms.length - 1];
  const st = t.state.toLowerCase();
  const isSen = t.type === "sen";
  const dcOffice = t.address || t.phone ? [{ name: "Washington, DC office", address: t.address, phone: t.phone }] : [];
  const localOffices = districtOffices
    .filter((o) => o.phone || o.address || o.city)
    .map((o) => ({
      name: o.city ? `${o.city} office` : "District office",
      address: formatDistrictAddress(o),
      phone: o.phone,
    }));
  const offices = [...dcOffice, ...localOffices];
  const phones = [...new Set([t.phone, ...localOffices.map((o) => o.phone)].filter((x): x is string => !!x))];
  const contacts: Contacts = {
    phones,
    website: t.url,
    contact_form_url: t.contact_form ?? t.url,
    offices,
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
  const [res, distRes] = await Promise.all([
    fetch(LEGISLATORS_URL),
    fetch(DISTRICT_OFFICES_URL).catch(() => null),
  ]);
  if (!res.ok) throw new Error(`congress-legislators ${res.status}`);
  const people = (await res.json()) as Legislator[];
  const byBioguide = new Map<string, DistrictOffice[]>();
  if (distRes?.ok) {
    const entries = (await distRes.json()) as DistrictOfficesEntry[];
    for (const e of entries) {
      if (e.id?.bioguide && e.offices?.length) byBioguide.set(e.id.bioguide, e.offices);
    }
  }
  return people.map((p) => federalOfficialFromLegislator(p, byBioguide.get(p.id.bioguide)));
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
  const offices = (p.offices ?? []).map((o) => {
    const rawName = o.name?.trim();
    const isGenericDistrict = !rawName || /^district office$/i.test(rawName);
    const cityMatch = isGenericDistrict ? o.address?.match(/,\s*([A-Za-z .'-]+),\s*[A-Z]{2}\b/) : null;
    const name = cityMatch
      ? `${cityMatch[1].trim()} district office`
      : rawName || (o.classification === "capitol" ? "Capitol office" : "District office");
    return {
      name,
      address: o.address,
      phone: o.voice,
    };
  });
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
  const res = await fetch(url, { headers: { "X-API-KEY": key }, cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Open States people.geo ${res.status}`);
  const json = (await res.json()) as { results: OSPerson[] };
  return json.results.map((p) => stateOfficialFromOpenStates(p, state)).filter((x): x is OfficialRow => !!x);
}

export const contactsOf = (o: { contacts?: unknown }) => (o.contacts ?? {}) as Contacts;

export type PhoneEntry = {
  label: string;
  phone: string;
  address?: string;
  isPrimary: boolean;
};

/**
 * Deduplicated phone numbers for an official, ordered with the Capitol / Washington, DC office first
 * and local / district offices after.
 */
export function phoneNumbersOf(c: Contacts): PhoneEntry[] {
  const seen = new Set<string>();
  const raw: { label: string; phone: string; address?: string }[] = [];

  for (const off of c.offices ?? []) {
    if (!off.phone) continue;
    const key = off.phone.replace(/\D/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    let label = off.name?.trim() || "Office";
    if (/^district office$/i.test(label) && off.address) {
      const city = off.address.match(/,\s*([A-Za-z .'-]+),\s*[A-Z]{2}\b/)?.[1]?.trim();
      if (city) label = `${city} district office`;
    }
    raw.push({ label, phone: off.phone, address: off.address });
  }

  for (const ph of c.phones ?? []) {
    const key = ph.replace(/\D/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    raw.push({
      label: raw.length === 0 ? (/^1?202/.test(key) ? "Washington, DC office" : "Main office") : "Local office",
      phone: ph,
    });
  }

  const isCapitol = (label: string) => /washington|d\.?c\.?|capitol/i.test(label);
  const primaryIdx = raw.findIndex((x) => isCapitol(x.label));
  if (primaryIdx > 0) {
    const [primary] = raw.splice(primaryIdx, 1);
    raw.unshift(primary);
  }

  return raw.map((x, i) => ({ ...x, isPrimary: i === 0 }));
}
