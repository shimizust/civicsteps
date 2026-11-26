import "server-only";
/**
 * On-demand ingestion. We only pull state bills for states where users live, and council items for cities
 * in ingest/legistar.config.ts, and the nightly run only looks back a couple of days. So the first user in
 * a new area would see nothing local until a backfill runs (ingest/run.ts). Saving a ZIP calls
 * requestAreaCoverage, which records the request and, when configured, dispatches
 * .github/workflows/backfill.yml to fetch and analyze that area's recent items right away.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { citySourceScope, LOCAL_SOURCES, stateScope } from "@/ingest/legistar.config";

export type Area = { scope: string; label: string };

/** The coverage scopes behind a user's feed: their state and their city's council. */
export function areasFor(state: string | null | undefined, jurisdictionIds: string[]): Area[] {
  const areas: Area[] = [];
  if (state) areas.push({ scope: stateScope(state), label: `${state} bills` });
  for (const src of LOCAL_SOURCES) {
    if (jurisdictionIds.includes(src.jurisdictionId)) areas.push({ scope: citySourceScope(src), label: `${src.name} council items` });
  }
  return areas;
}

export async function requestAreaCoverage(areas: Area[]): Promise<string[]> {
  if (!areas.length) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ingest_coverage")
    .select("scope, backfilled_at, progress")
    .in("scope", areas.map((a) => a.scope));
  if (error) throw error;
  const covered = new Set(data.filter((r) => r.backfilled_at && r.progress !== "analyzing").map((r) => r.scope));
  const missing = areas.filter((a) => !covered.has(a.scope));
  if (!missing.length) return [];
  const pending = missing.map((a) => a.label);

  const { data: claimed, error: claimError } = await admin.rpc("claim_area_backfill", { p_scopes: missing.map((a) => a.scope) });
  if (claimError) throw claimError;
  const canDispatch = process.env.INGEST_DISPATCH_TOKEN && process.env.INGEST_DISPATCH_REPO;
  if (canDispatch && claimed) await dispatchBackfill();
  return pending;
}

/** Starts the backfill workflow. Needs a GitHub token with Actions: write on the repo. */
async function dispatchBackfill() {
  const repo = process.env.INGEST_DISPATCH_REPO!;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/backfill.yml/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.INGEST_DISPATCH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: process.env.INGEST_DISPATCH_REF || "main" }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error("backfill dispatch failed", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.error("backfill dispatch failed", err);
  }
}
