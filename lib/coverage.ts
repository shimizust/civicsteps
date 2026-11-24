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

export type CoverageStatus =
  | "ready" //       everything for this area is already ingested
  | "backfilling" // a backfill run was started (now or within the last hour)
  | "next-run"; //   will be backfilled by the next scheduled ingest

export type Area = { scope: string; label: string };

/** The coverage scopes behind a user's feed: their state (if state bills are ingested) and their city's council. */
export function areasFor(state: string | null | undefined, jurisdictionIds: string[]): Area[] {
  const areas: Area[] = [];
  if (state && process.env.OPENSTATES_API_KEY) areas.push({ scope: stateScope(state), label: `${state} bills` });
  for (const src of LOCAL_SOURCES) {
    if (jurisdictionIds.includes(src.jurisdictionId)) areas.push({ scope: citySourceScope(src), label: `${src.name} council items` });
  }
  return areas;
}

const REDISPATCH_AFTER_MS = 60 * 60 * 1000;

export async function requestAreaCoverage(areas: Area[]): Promise<{ status: CoverageStatus; pending: string[] }> {
  if (!areas.length) return { status: "ready", pending: [] };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ingest_coverage")
    .select("scope, requested_at, backfilled_at")
    .in("scope", areas.map((a) => a.scope));
  if (error) {
    console.error("ingest_coverage lookup failed", error.message);
    return { status: "ready", pending: [] };
  }
  const rows = new Map(data.map((r) => [r.scope, r]));
  const missing = areas.filter((a) => !rows.get(a.scope)?.backfilled_at);
  if (!missing.length) return { status: "ready", pending: [] };
  const pending = missing.map((a) => a.label);

  const canDispatch = !!(process.env.INGEST_DISPATCH_TOKEN && process.env.INGEST_DISPATCH_REPO);
  const now = Date.now();
  // Someone here asked recently, so a run is already on its way.
  const recent = missing.every((a) => {
    const at = rows.get(a.scope)?.requested_at;
    return at && now - Date.parse(at) < REDISPATCH_AFTER_MS;
  });
  if (recent) return { status: canDispatch ? "backfilling" : "next-run", pending };

  await admin.from("ingest_coverage").upsert(
    missing.map((a) => ({ scope: a.scope, requested_at: new Date(now).toISOString() })),
    { onConflict: "scope" },
  );
  return { status: canDispatch && (await dispatchBackfill()) ? "backfilling" : "next-run", pending };
}

/** Starts the backfill workflow. Needs a GitHub token with Actions: write on the repo. */
async function dispatchBackfill(): Promise<boolean> {
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
    return res.ok;
  } catch (err) {
    console.error("backfill dispatch failed", err);
    return false;
  }
}
