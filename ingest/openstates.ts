/** State bills from Open States v3 — only for states where we have users, to stay inside the free quota. */
import { ACTIVE_DAYS, getJson, stripHtml, truncate, type NormalizedItem } from "./normalize";

type OSBill = {
  id: string;
  identifier: string;
  title: string;
  session: string;
  jurisdiction: { id: string; name: string };
  from_organization?: { name: string; classification: string };
  first_action_date?: string | null;
  latest_action_date?: string | null;
  latest_action_description?: string | null;
  openstates_url: string;
  abstracts?: { abstract: string }[];
  sponsorships?: { name: string; primary: boolean; person?: { id: string } | null }[];
  actions?: { date: string; description: string; classification: string[] }[];
};

/** How long feeds show a state bill after its last action, and a signed law after signing (feed_candidates()). */
export { ACTIVE_DAYS } from "./normalize";
export const ENACTED_DAYS = 120;

/** When the bill was signed into law (or became law without a signature), from Open States' action classifications. */
export function enactedDate(b: Pick<OSBill, "actions">): string | null {
  const dates = (b.actions ?? [])
    .filter((a) => a.classification.includes("executive-signature") || a.classification.includes("became-law"))
    .map((a) => a.date.slice(0, 10))
    .sort();
  return dates[0] ?? null;
}

/** Whether a feed would show this bill: recent action, or signed into law recently. Others aren't worth analyzing. */
export function isFeedWorthy(i: Pick<NormalizedItem, "last_action_at" | "enacted_at">, now = new Date()): boolean {
  const daysAgo = (d: string | null | undefined) => (d ? (now.getTime() - Date.parse(d)) / 86_400_000 : Infinity);
  return daysAgo(i.last_action_at) < ACTIVE_DAYS || daysAgo(i.enacted_at) < ENACTED_DAYS;
}

export function normalizeOpenStatesBill(b: OSBill, state: string): NormalizedItem {
  const st = state.toLowerCase();
  return {
    source: "openstates",
    external_id: b.id,
    type: "bill",
    level: "state",
    jurisdiction_id: `ocd-division/country:us/state:${st}`,
    state: state.toUpperCase(),
    title: truncate(`${b.identifier}: ${b.title}`, 500),
    description: b.abstracts?.length ? truncate(stripHtml(b.abstracts.map((a) => a.abstract).join("\n")) ?? "", 6000) : null,
    url: b.openstates_url,
    action_url: b.openstates_url,
    agency: b.from_organization?.name ? `${b.jurisdiction.name} ${b.from_organization.name}` : `${b.jurisdiction.name} Legislature`,
    status: b.latest_action_description ? truncate(b.latest_action_description, 300) : null,
    introduced_at: b.first_action_date?.slice(0, 10) ?? null,
    last_action_at: b.latest_action_date?.slice(0, 10) ?? null,
    last_action: b.latest_action_description ?? null,
    enacted_at: enactedDate(b),
    comment_deadline: null,
    officials: (b.sponsorships ?? [])
      .filter((s) => s.person?.id)
      .map((s) => ({ official_id: s.person!.id, role: s.primary ? ("sponsor" as const) : ("cosponsor" as const) })),
  };
}

/**
 * Bills changed since `since`. `by: "updated"` (nightly) catches any change to a bill's record;
 * `by: "action"` (backfill) only bills with a legislative action since then.
 * Bills a feed wouldn't show (stale, vetoed, died in committee) are dropped so they aren't analyzed.
 */
export async function fetchStateBills(
  state: string,
  since: Date,
  {
    maxPages = 5,
    by = "updated",
    onProgress,
  }: {
    maxPages?: number;
    by?: "updated" | "action";
    onProgress?: (info: { page: number; maxPage: number; found: number }) => Promise<void> | void;
  } = {},
): Promise<NormalizedItem[]> {
  const key = process.env.OPENSTATES_API_KEY;
  if (!key) return [];
  const out: NormalizedItem[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const u = new URL("https://v3.openstates.org/bills");
    u.searchParams.set("jurisdiction", `ocd-jurisdiction/country:us/state:${state.toLowerCase()}/government`);
    u.searchParams.set(by === "action" ? "action_since" : "updated_since", since.toISOString().slice(0, 10));
    // Not latest_action_desc: thousands of bills share a last-action date, and pages sorted on a tie overlap.
    u.searchParams.set("sort", "updated_desc");
    u.searchParams.set("per_page", "20");
    u.searchParams.set("page", String(page));
    u.searchParams.append("include", "sponsorships");
    u.searchParams.append("include", "abstracts");
    u.searchParams.append("include", "actions");
    const data = await getJson<{ results: OSBill[]; pagination: { max_page: number } }>(u, { headers: { "X-API-KEY": key } });
    out.push(...data.results.map((b) => normalizeOpenStatesBill(b, state)).filter((i) => isFeedWorthy(i)));
    await onProgress?.({
      page,
      maxPage: Math.min(maxPages, data.pagination.max_page),
      found: out.length,
    });
    if (page >= data.pagination.max_page) break;
    await new Promise((r) => setTimeout(r, 6500)); // free tier: ~10 requests/minute
  }
  return out;
}
