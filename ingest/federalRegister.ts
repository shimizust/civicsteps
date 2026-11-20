/** Open federal comment periods (proposed rules, notices) from the Federal Register API. No key needed. */
import { endOfDayEastern, getJson, OCD_US, type NormalizedItem } from "./normalize";

type FRDoc = {
  title: string;
  abstract: string | null;
  agencies: { name: string; raw_name?: string }[];
  comments_close_on: string | null;
  document_number: string;
  html_url: string;
  type: string;
  publication_date: string;
  docket_ids?: string[];
  regulations_dot_gov_info?: { document_id?: string; docket_id?: string } | null;
};
type FRPage = { count: number; total_pages: number; next_page_url?: string | null; results: FRDoc[] };

const FIELDS = [
  "title", "abstract", "agencies", "comments_close_on", "document_number",
  "html_url", "type", "publication_date", "docket_ids", "regulations_dot_gov_info",
];

export function normalizeFRDoc(d: FRDoc): NormalizedItem | null {
  if (!d.comments_close_on) return null;
  const agency = d.agencies.at(-1)?.name ?? d.agencies[0]?.name ?? null; // most specific (sub-agency) last
  const regsDoc = d.regulations_dot_gov_info?.document_id;
  return {
    source: "federalregister",
    external_id: d.document_number,
    type: "comment_period",
    level: "federal",
    jurisdiction_id: OCD_US,
    state: null,
    title: d.title,
    description: d.abstract,
    url: d.html_url,
    action_url: regsDoc ? `https://www.regulations.gov/commenton/${regsDoc}` : d.html_url,
    agency,
    status: d.type,
    introduced_at: d.publication_date,
    last_action_at: d.publication_date,
    last_action: `${d.type} published`,
    comment_deadline: endOfDayEastern(d.comments_close_on),
  };
}

export async function fetchOpenCommentPeriods(maxPages = 10): Promise<NormalizedItem[]> {
  const today = new Date().toISOString().slice(0, 10);
  const url = new URL("https://www.federalregister.gov/api/v1/documents.json");
  url.searchParams.set("per_page", "1000");
  url.searchParams.set("order", "newest");
  url.searchParams.set("conditions[comment_date][gte]", today);
  FIELDS.forEach((f) => url.searchParams.append("fields[]", f));

  const out: NormalizedItem[] = [];
  let next: string | null = url.toString();
  for (let page = 0; next && page < maxPages; page++) {
    const data: FRPage = await getJson<FRPage>(next);
    for (const d of data.results ?? []) {
      const n = normalizeFRDoc(d);
      if (n) out.push(n);
    }
    next = data.next_page_url ?? null;
  }
  return out;
}
