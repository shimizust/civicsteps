import rawOrganizations from "./advocacy-organizations.json";
import { topicParent } from "./taxonomy";

export type Organization = {
  name: string;
  url: string;
  topics: string[];
  state?: string;
  cityClient?: string;
  feeds?: string[];
  extraHubs?: string[];
  alertFeed?: boolean;
};

export const organizations: Organization[] = rawOrganizations as Organization[];

export type Alert = {
  url: string;
  title: string;
  references: string[];
  billTitles?: string[];
  position?: "Supported" | "Opposed";
  state: "listed" | "closed" | "unlisted" | "unverified";
  checked: string | null;
  textHash?: string;
  matchedItems?: { id: string; title: string }[];
};
export type SourceCheck = {
  organization: string;
  attempted: string;
  checked: string | null;
  alerts: Alert[];
};
export type CampaignSnapshot = SourceCheck[];

export function organizationsForTopic(slug: string) {
  return organizations.filter((org) => org.topics.some((topic) => topic === slug || topicParent(topic) === slug));
}

const CONGRESS_TYPE_TO_SLUG: Record<string, string> = {
  HR: "house-bill",
  S: "senate-bill",
  HRES: "house-resolution",
  SRES: "senate-resolution",
  HJRES: "house-joint-resolution",
  SJRES: "senate-joint-resolution",
  HCONRES: "house-concurrent-resolution",
  SCONRES: "senate-concurrent-resolution",
};
const SLUG_TO_CONGRESS_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(CONGRESS_TYPE_TO_SLUG).map(([k, v]) => [v, k]),
);

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function currentCongressNumber(now = new Date()): number {
  const year = now.getUTCFullYear();
  const effectiveYear = now.getUTCMonth() === 0 && now.getUTCDate() < 3 ? year - 1 : year;
  return Math.floor((effectiveYear - 1789) / 2) + 1;
}

export function congressReferenceKey(congress: number, type: string, number: string): string | null {
  const slug = CONGRESS_TYPE_TO_SLUG[type.toUpperCase()];
  if (!slug || !Number.isFinite(congress) || !/^\d+$/.test(number)) return null;
  return `congress.gov/bill/${ordinal(congress)}-congress/${slug}/${number}`;
}

export function parseCongressReference(ref: string): { congress: number; type: string; number: string } | null {
  const m = ref.match(/^congress\.gov\/bill\/(\d+)(?:th|st|nd|rd)-congress\/([a-z-]+)\/(\d+)$/i);
  if (!m) return null;
  const type = SLUG_TO_CONGRESS_TYPE[m[2].toLowerCase()];
  if (!type) return null;
  return { congress: Number(m[1]), type, number: m[3] };
}

export function openStatesReferenceKey(state: string, session: string, identifier: string): string {
  const cleanId = identifier.replace(/\s+/g, "").toLowerCase();
  const cleanSession = session.replace(/\s+/g, "").toLowerCase();
  return `openstates/${state.toLowerCase()}/bills/${cleanSession}/${cleanId}`;
}

export function parseOpenStatesReference(ref: string): { state: string; session: string; identifier: string } | null {
  const m = ref.match(/^openstates\/([a-z]{2})\/bills\/([^/]+)\/([a-z]+)(\d+)$/i);
  if (!m) return null;
  return { state: m[1].toUpperCase(), session: m[2], identifier: `${m[3].toUpperCase()} ${m[4]}` };
}

export function currentStateSession(state: string, now = new Date()): string {
  const year = now.getUTCFullYear();
  const odd = year % 2 === 1 ? year : year - 1;
  const st = state.toUpperCase();
  if (st === "WA" || st === "NY") return `${odd}-${odd + 1}`;
  if (st === "CO") return `${year}A`;
  return `${odd}${odd + 1}`;
}

// Retain identity-bearing query parameters (especially Legistar IDs).
export function referenceKey(raw?: string | null) {
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/$/, "");
  if (host.endsWith(".legistar.com") && /^\/LegislationDetail\.aspx$/i.test(path)) {
    const id = [...u.searchParams].find(([key]) => key.toLowerCase() === "id")?.[1];
    return id && /^\d+$/.test(id) ? host + "/" + id : null;
  }
  if (host === "congress.gov") {
    const bill = path.match(/^\/bill\/\d+(?:th|st|nd|rd)-congress\/[a-z-]+\/\d+(?=\/|$)/i);
    if (bill) return host + bill[0].toLowerCase();
    const pdf = path.match(/^\/(\d+)\/bills\/(hr|hres|hjres|hconres|s|sres|sjres|sconres)(\d+)(?=\/|$)/i);
    if (pdf) return congressReferenceKey(Number(pdf[1]), pdf[2], pdf[3]);
    return null;
  }
  if (host === "regulations.gov") {
    const doc = path.match(/^\/(?:document|commenton)\/([^/]+)/i)?.[1];
    if (doc) return host + "/" + doc.toLowerCase();
    const docket = path.match(/^\/docket\/([^/]+)/i)?.[1];
    if (docket) return host + "/docket/" + docket.toLowerCase();
    if (/^\/docketbrowser$/i.test(path)) {
      const d = [...u.searchParams].find(([key]) => key.toLowerCase() === "d")?.[1];
      if (d && /^[A-Za-z0-9_-]+$/.test(d)) return host + "/docket/" + d.toLowerCase();
    }
    return null;
  }
  if (host === "federalregister.gov") {
    const doc = path.match(/^\/documents\/\d{4}\/\d\d\/\d\d\/([^/]+)/i)?.[1]
      ?? path.match(/^\/d\/([^/]+)/i)?.[1];
    return doc ? host + "/" + doc.toLowerCase() : null;
  }
  if (host === "leginfo.legislature.ca.gov") {
    const bill = u.searchParams.get("bill_id")?.match(/^(\d{8})0([A-Z]+\d+)$/);
    return bill ? "openstates/ca/bills/" + bill[1] + "/" + bill[2].toLowerCase() : null;
  }
  if (host === "pluralpolicy.com") {
    const details = path.match(/^\/app\/legislative-tracking\/bill\/details\/state-([a-z]{2})-([^-]+)-([a-z]+\d+)$/i);
    if (details) return openStatesReferenceKey(details[1], details[2], details[3]);
    return null;
  }
  if ((host === "openstates.org" || host === "open.pluralpolicy.com") && /^\/(?:bill|[a-z]{2}\/bills)\//i.test(path)) {
    return "openstates" + path.toLowerCase();
  }
  return null;
}

const HISTORIC_STATUTE_STOPLIST = new Set([
  "clean water act",
  "clean air act",
  "endangered species act",
  "social security act",
  "national environmental policy act",
  "affordable care act",
  "voting rights act",
  "civil rights act",
  "freedom of information act",
  "congressional review act",
  "housing accountability act",
  "national historic preservation act",
  "americans with disabilities act",
  "tax cuts and jobs act",
  "infrastructure investment and jobs act",
  "inflation reduction act",
  "higher education act",
  "every student succeeds act",
  "digital millennium copyright act",
  "national defense authorization act",
  "community reinvestment act",
  "california environmental quality act",
  "family and medical leave act",
  "fair labor standards act",
  "fair housing act",
  "administrative procedure act",
  "antiquities act",
  "wilderness act",
  "patriot act",
  "gun control act",
  "rail passenger service act",
  "communications decency act",
  "consumer fraud and abuse act",
  "tax reform act",
  "economic recovery tax act",
  "protect act",
  "national voter registration act",
  "bipartisan safer communities act",
  "equal pay act",
  "great american outdoors act",
  "digital services act",
]);

const TITLE_STOPWORDS = new Set(["the", "and", "of", "for", "to", "in", "on", "with", "through", "by", "from", "a", "an", "act", "bill"]);
const VERB_BEFORE_ACT = /\b(?:must|should|will|can|could|would|to|not|now)\s+act$/;

export function normalizeBillTitle(raw: string): string | null {
  let s = raw.replace(/[“”"]/g, "").replace(/[’']/g, "'").trim();
  // Strip leading bill number prefixes like "H.R. 7296: " or "CB 121326: "
  s = s.replace(
    /^(?:(?:H\.?\s*R\.?|H\.?\s*J\.?\s*Res\.?|S\.?\s*J\.?\s*Res\.?|H\.?\s*Con\.?\s*Res\.?|S\.?\s*Con\.?\s*Res\.?|H\.?\s*Res\.?|S\.?\s*Res\.?|S\.|AB|SB|HB|CB|ACA|SCA|AJR|SJR)\s*\d+\s*[:\-–—]\s*)+/i,
    "",
  );
  // Strip leading call-to-action wrappers, section references, and articles
  for (let i = 0; i < 5; i++) {
    const next = s
      .replace(/^(?:take action[!:\s]+|advocacy[:\s]+|signed into law[:\s]+)/i, "")
      .replace(/^(?:section\s+\d+[a-z]?\s+of\s+|under\s+|through\s+|reforms\s+|bury\s+)/i, "")
      .replace(/^(?:urge|tell|ask|call on)\s+(?:your\s+)?(?:congress|members of congress|lawmakers|senate|house|senators?|representatives?)\s+(?:to\s+)?/i, "")
      .replace(/^(?:support|oppose|pass|enact|veto|reject|defeat|cosponsor|reintroduce|take)\s+/i, "")
      .replace(/^(?:protect|stop|fix)\s+the\s+/i, "")
      .replace(/^(?:the|a|an)\s+/i, "")
      .trim();
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\s+of\s+20\d{2}$/i, "");
  s = s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (s.length < 12) return null;
  if (/^\d{4}\s+/.test(s)) return null;
  if (VERB_BEFORE_ACT.test(s)) return null;
  if (HISTORIC_STATUTE_STOPLIST.has(s)) return null;
  const meaningful = s.split(" ").filter((w) => w.length > 1 && !TITLE_STOPWORDS.has(w));
  if (meaningful.length < 2) return null;
  return s;
}

export function itemReferenceKeys(item: {
  url: string | null;
  action_url: string | null;
  source?: string | null;
  external_id?: string | null;
  title?: string | null;
  state?: string | null;
}): Set<string> {
  const keys = new Set<string>();
  const add = (k: string | null) => { if (k) keys.add(k); };
  add(referenceKey(item.url));
  add(referenceKey(item.action_url));

  if (item.action_url) {
    const regMatch = item.action_url.match(/regulations\.gov\/(?:document|commenton)\/([^/?#]+)/i);
    if (regMatch) {
      const docId = regMatch[1].toLowerCase();
      add(`regulations.gov/${docId}`);
      if (/-\d+$/.test(docId)) add(`regulations.gov/docket/${docId.replace(/-\d+$/, "")}`);
    }
  }
  if (item.source === "federalregister" && item.external_id) {
    add(`federalregister.gov/${item.external_id.toLowerCase()}`);
  }
  if (item.source === "congress" && item.external_id) {
    const parts = item.external_id.match(/^(\d+)-([A-Z]+)-(\d+)$/i);
    if (parts) add(congressReferenceKey(Number(parts[1]), parts[2], parts[3]));
  }
  if (item.source === "legistar" && item.external_id && item.title) {
    const client = item.external_id.split(":")[0]?.toLowerCase();
    const fileMatch = item.title.match(/^(CB|Ord\.?|Res\.?)\s*(\d{3,6})\b/i);
    if (client && fileMatch) {
      add(`legistar/${client}/file/${fileMatch[1].replace(/\./g, "").toLowerCase()}${fileMatch[2]}`);
    }
  }
  return keys;
}

const FEDERAL_TYPE_MAP: Record<string, string> = {
  hr: "HR",
  housebill: "HR",
  s: "S",
  senatebill: "S",
  hres: "HRES",
  sres: "SRES",
  hjres: "HJRES",
  sjres: "SJRES",
  hconres: "HCONRES",
  sconres: "SCONRES",
};

const PAST_YEAR_OR_CONGRESS_BEFORE = /\b(?:11[0-8](?:th|st|nd|rd)|19\d{2}|20[01]\d|202[0-4])\b/;
const PAST_YEAR_PARENS_AFTER = /^\s*\((?:19\d{2}|20[01]\d|202[0-4])\)/;

export function extractTextReferences(
  title: string,
  text: string,
  opts?: { state?: string; cityClient?: string; now?: Date },
): { references: string[]; billTitles: string[] } {
  const now = opts?.now ?? new Date();
  const congress = currentCongressNumber(now);
  const refs = new Set<string>();
  const titles = new Set<string>();
  const combined = `${title}\n${text}`;

  // 1. Federal bill numbers (case-sensitive prefixes so "U.S. 101" or lowercase words never match)
  const fedRe = /(?:^|[^A-Za-z0-9.])(H\.?\s*R\.?|H\.?\s*J\.?\s*Res\.?|S\.?\s*J\.?\s*Res\.?|H\.?\s*Con\.?\s*Res\.?|S\.?\s*Con\.?\s*Res\.?|H\.?\s*Res\.?|S\.?\s*Res\.?|S\.|Senate Bill|House Bill)\s*(\d{1,5})\b/g;
  for (const m of combined.matchAll(fedRe)) {
    const idx = m.index ?? 0;
    const before = combined.slice(Math.max(0, idx - 40), idx);
    const after = combined.slice(idx + m[0].length, idx + m[0].length + 12);
    if (PAST_YEAR_OR_CONGRESS_BEFORE.test(before) || PAST_YEAR_PARENS_AFTER.test(after)) continue;
    const normPrefix = m[1].replace(/[\s.]+/g, "").toLowerCase();
    // On state-scoped orgs, bare "Senate Bill N" / "House Bill N" refers to the state bill unless qualified as U.S./federal.
    if (opts?.state && (normPrefix === "senatebill" || normPrefix === "housebill") && !/\b(?:u\.?s\.?|federal|congress)\s*$/i.test(before)) {
      continue;
    }
    const type = FEDERAL_TYPE_MAP[normPrefix];
    if (type) {
      const key = congressReferenceKey(congress, type, m[2]);
      if (key) refs.add(key);
    }
  }

  // 2. Regulations.gov docket & document IDs
  const docketRe = /\b([A-Z]{2,6}(?:-[A-Z0-9]{1,6}){0,3}-202\d-\d{4})(?:-(\d{4}))?\b/g;
  for (const m of combined.matchAll(docketRe)) {
    const docket = m[1].toLowerCase();
    refs.add(`regulations.gov/docket/${docket}`);
    if (m[2]) refs.add(`regulations.gov/${docket}-${m[2].toLowerCase()}`);
  }

  // 3. Federal Register document numbers near explicit FR context
  const frRe = /\b(202\d-\d{5})\b/g;
  for (const m of combined.matchAll(frRe)) {
    const idx = m.index ?? 0;
    const windowText = combined.slice(Math.max(0, idx - 60), idx + m[0].length + 60);
    if (/federal\s+register|\bFR\s+Doc\b|document\s+number/i.test(windowText)) {
      refs.add(`federalregister.gov/${m[1].toLowerCase()}`);
    }
  }

  // 4. State bill numbers (only when org is scoped to a state)
  if (opts?.state) {
    const session = currentStateSession(opts.state, now);
    const stRe = /\b(AB|SB|HB|ACA|SCA|AJR|SJR|Senate Bill|House Bill)\s*(\d{1,5})\b/g;
    for (const m of combined.matchAll(stRe)) {
      const idx = m.index ?? 0;
      const before = combined.slice(Math.max(0, idx - 40), idx);
      const after = combined.slice(idx + m[0].length, idx + m[0].length + 12);
      if (/\b(?:19\d{2}|20[01]\d|202[0-4])\b/.test(before) || PAST_YEAR_PARENS_AFTER.test(after)) continue;
      if ((m[1] === "Senate Bill" || m[1] === "House Bill") && /\b(?:u\.?s\.?|federal|congress)\s*$/i.test(before)) continue;
      const prefix = m[1] === "Senate Bill" ? "SB" : m[1] === "House Bill" ? "HB" : m[1];
      refs.add(openStatesReferenceKey(opts.state, session, `${prefix}${m[2]}`));
    }
  }

  // 5. City Legistar bill numbers (only when org is scoped to a city client)
  if (opts?.cityClient) {
    const cityRe = /\b(CB|Ord\.?|Res\.?)\s*(\d{4,6})\b/g;
    for (const m of combined.matchAll(cityRe)) {
      refs.add(`legistar/${opts.cityClient.toLowerCase()}/file/${m[1].replace(/\./g, "").toLowerCase()}${m[2]}`);
    }
  }

  // 6. Capitalized "... Act" short titles from title + opening body text (single-line spaces only)
  const actSource = `${title}\n${text.slice(0, 2000)}`;
  const actRe = /\b([A-Z][A-Za-z0-9’'-]+(?: +(?:[A-Z0-9][A-Za-z0-9’'-]*|of|for|the|and|to|in|on|with|through|by|from|without|under)){1,9} +Act(?: +of +202\d)?)\b/g;
  for (const m of actSource.matchAll(actRe)) {
    const norm = normalizeBillTitle(m[1]);
    if (norm) titles.add(norm);
  }
  const titleNorm = normalizeBillTitle(title);
  if (titleNorm && /\bact$/.test(titleNorm)) titles.add(titleNorm);

  return { references: [...refs], billTitles: [...titles] };
}

export function alertsForItem(
  snapshot: CampaignSnapshot,
  item: {
    url: string | null;
    action_url: string | null;
    title?: string | null;
    source?: string | null;
    external_id?: string | null;
    state?: string | null;
  },
) {
  const keys = itemReferenceKeys(item);
  const itemTitle = item.title ? normalizeBillTitle(item.title) : null;
  return snapshot.flatMap((source) =>
    source.alerts
      .filter(
        (alert) =>
          alert.references.some((ref) => keys.has(ref)) ||
          (!!itemTitle && !!alert.billTitles?.includes(itemTitle)),
      )
      .map((alert) => ({ ...alert, organization: source.organization })),
  );
}

export const stateLabel: Record<Alert["state"], string> = {
  listed: "Source available", closed: "Closed", unlisted: "No longer listed or available", unverified: "Availability unverified",
};

export function reviewDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));
}
