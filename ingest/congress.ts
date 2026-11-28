/** Federal bills from the Congress.gov API (api.data.gov key; DEMO_KEY works for light testing). */
import { ACTIVE_DAYS, getJson, OCD_US, stripHtml, truncate, type NormalizedItem } from "./normalize";

type CGBill = {
  congress: number;
  type: string;
  number: string;
  title: string;
  introducedDate?: string;
  originChamber?: string;
  latestAction?: { actionDate: string; text: string };
  updateDate: string;
};

const TYPE_PATH: Record<string, string> = {
  HR: "house-bill", S: "senate-bill", HRES: "house-resolution", SRES: "senate-resolution",
  HJRES: "house-joint-resolution", SJRES: "senate-joint-resolution",
  HCONRES: "house-concurrent-resolution", SCONRES: "senate-concurrent-resolution",
};
const TYPE_LABEL: Record<string, string> = {
  HR: "H.R.", S: "S.", HRES: "H.Res.", SRES: "S.Res.", HJRES: "H.J.Res.", SJRES: "S.J.Res.",
  HCONRES: "H.Con.Res.", SCONRES: "S.Con.Res.",
};

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function congressBillUrl(b: Pick<CGBill, "congress" | "type" | "number">) {
  return `https://www.congress.gov/bill/${ordinal(b.congress)}-congress/${TYPE_PATH[b.type] ?? "bill"}/${b.number}`;
}

export function normalizeCongressBill(b: CGBill, extra?: { summary?: string | null; sponsors?: string[] }): NormalizedItem {
  const label = `${TYPE_LABEL[b.type] ?? b.type} ${b.number}`;
  return {
    source: "congress",
    external_id: `${b.congress}-${b.type}-${b.number}`,
    type: "bill",
    level: "federal",
    jurisdiction_id: OCD_US,
    state: null,
    title: truncate(`${label}: ${b.title}`, 500),
    description: extra?.summary ? truncate(extra.summary, 6000) : null,
    url: congressBillUrl(b),
    action_url: congressBillUrl(b),
    agency: b.originChamber ? `U.S. ${b.originChamber}` : "U.S. Congress",
    status: b.latestAction?.text ? truncate(b.latestAction.text, 300) : null,
    introduced_at: b.introducedDate?.slice(0, 10) ?? null,
    last_action_at: b.latestAction?.actionDate ?? b.updateDate.slice(0, 10),
    last_action: b.latestAction?.text ?? null,
    comment_deadline: null,
    officials: (extra?.sponsors ?? []).map((id) => ({ official_id: `bioguide:${id}`, role: "sponsor" as const })),
  };
}

const key = () => process.env.API_DATA_GOV_KEY || "DEMO_KEY";
const api = (path: string, params: Record<string, string> = {}) => {
  const u = new URL(`https://api.congress.gov/v3${path}`);
  u.search = new URLSearchParams({ format: "json", api_key: key(), ...params }).toString();
  return u;
};

/** Current Congress number (each convenes Jan 3 of odd years; 1st Congress = 1789). */
export function currentCongress(now = new Date()): number {
  const year = now.getUTCFullYear();
  const effectiveYear = now.getUTCMonth() === 0 && now.getUTCDate() < 3 ? year - 1 : year;
  return Math.floor((effectiveYear - 1789) / 2) + 1;
}

/** Whether a bill has had legislative action inside the active feed window. */
export function isActiveBill(b: Pick<CGBill, "latestAction" | "updateDate">, now = new Date()): boolean {
  const d = b.latestAction?.actionDate ?? b.updateDate;
  const ms = Date.parse(d);
  return Number.isFinite(ms) && (now.getTime() - ms) / 86_400_000 < ACTIVE_DAYS;
}

/** Active bills in the current Congress updated since `since`. Detail calls happen only for newly seen bills. */
export async function fetchUpdatedBills(since: Date, maxBills = 500, now = new Date()): Promise<CGBill[]> {
  const bills: CGBill[] = [];
  const pageSize = Math.min(250, Math.max(maxBills, 50));
  const maxPages = Math.max(4, Math.ceil(maxBills / pageSize) * 3);
  const congress = currentCongress(now);
  for (let page = 0; page < maxPages && bills.length < maxBills; page++) {
    const data = await getJson<{ bills?: CGBill[] }>(
      api(`/bill/${congress}`, {
        fromDateTime: since.toISOString().replace(/\.\d+Z$/, "Z"),
        sort: "updateDate desc",
        limit: String(pageSize),
        offset: String(page * pageSize),
      }),
    );
    const batch = data.bills ?? [];
    for (const b of batch) {
      if (isActiveBill(b, now)) {
        bills.push(b);
        if (bills.length >= maxBills) break;
      }
    }
    if (batch.length < pageSize) break;
  }
  return bills;
}

export async function fetchBillDetail(b: CGBill): Promise<{ summary: string | null; sponsors: string[] }> {
  const base = `/bill/${b.congress}/${b.type.toLowerCase()}/${b.number}`;
  const [detail, summaries] = await Promise.all([
    getJson<{ bill: { sponsors?: { bioguideId: string }[] } }>(api(base)),
    getJson<{ summaries?: { text: string; updateDate: string }[] }>(api(`${base}/summaries`)).catch(() => ({ summaries: [] })),
  ]);
  const latest = (summaries.summaries ?? []).sort((x, y) => y.updateDate.localeCompare(x.updateDate))[0];
  return {
    summary: stripHtml(latest?.text),
    sponsors: (detail.bill.sponsors ?? []).map((s) => s.bioguideId),
  };
}

/** Fetches a single current- or prior-Congress bill directly by ID (used for campaign-referenced bills). */
export async function fetchCongressBillById(congress: number, type: string, number: string): Promise<NormalizedItem | null> {
  const base = `/bill/${congress}/${type.toLowerCase()}/${number}`;
  const res = await fetch(api(base), { signal: AbortSignal.timeout(9000) });
  if (res.status === 404) {
    await res.body?.cancel();
    return null;
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`${res.status} ${res.statusText} from ${base}`);
  }
  const detail = (await res.json()) as { bill?: CGBill & { sponsors?: { bioguideId: string }[] } };
  if (!detail.bill) return null;
  const summaries = await getJson<{ summaries?: { text: string; updateDate: string }[] }>(api(`${base}/summaries`)).catch(
    () => ({ summaries: [] }),
  );
  const latest = (summaries.summaries ?? []).sort((x, y) => y.updateDate.localeCompare(x.updateDate))[0];
  return normalizeCongressBill(detail.bill, {
    summary: stripHtml(latest?.text),
    sponsors: (detail.bill.sponsors ?? []).map((s) => s.bioguideId).filter(Boolean),
  });
}
