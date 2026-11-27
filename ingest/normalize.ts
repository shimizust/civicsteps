import { createHash } from "crypto";
import type { Database } from "@/lib/supabase/database.types";

type ItemInsert = Database["public"]["Tables"]["items"]["Insert"];

/** What every source adapter produces. */
export type NormalizedItem = Omit<ItemInsert, "id" | "content_hash" | "analysis_status" | "analysis_batch_id" | "created_at" | "updated_at"> & {
  officials?: { official_id: string; role: "sponsor" | "cosponsor" | "committee" | "voted"; vote?: string }[];
};

/**
 * Hash only fields that change the analysis. A status update ("passed committee")
 * shouldn't trigger another LLM call; a new title or description should.
 */
export function contentHash(i: Pick<NormalizedItem, "title" | "description" | "type">): string {
  return createHash("sha1").update(`${i.type}\n${i.title}\n${i.description ?? ""}`).digest("hex");
}

export const OCD_US = "ocd-division/country:us";

/** How long feeds keep an item active after its latest action (matches feed_candidates()). */
export const ACTIVE_DAYS = 45;

/** Takes items round-robin across buckets so a cap doesn't let one source starve the others. */
export function interleaveBuckets<T>(buckets: T[][], limit: number): T[] {
  const out: T[] = [];
  for (let i = 0; out.length < limit; i++) {
    let added = false;
    for (const bucket of buckets) {
      if (i < bucket.length) {
        out.push(bucket[i]);
        added = true;
        if (out.length >= limit) break;
      }
    }
    if (!added) break;
  }
  return out;
}

export function stripHtml(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() || null;
}

export const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** Comment deadlines are dates; treat them as 11:59pm Eastern on that day. */
export const endOfDayEastern = (date: string) => `${date}T23:59:00-05:00`;

export async function getJson<T>(url: string | URL, init?: RequestInit, retries = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return (await res.json()) as T;
    if (attempt < retries && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    const redacted = String(url).replace(/api_key=[^&]+/, "api_key=***");
    throw new Error(`${res.status} ${res.statusText} from ${redacted}`);
  }
}
