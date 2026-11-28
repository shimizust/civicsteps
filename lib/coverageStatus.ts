/**
 * Pure coverage-status helpers shared across Server Components, Client Components, and unit tests.
 * Keep free of `"server-only"` imports so client bundles can use city support and phase helpers.
 */
import { citySourceScope, LOCAL_SOURCES, stateScope } from "@/ingest/legistar.config";
import { placeName } from "@/lib/place";

export const STALE_PROGRESS_MS = 65 * 60 * 1000;

export type CoverageScopeKind = "state" | "city";

export type Area = { scope: string; label: string; kind: CoverageScopeKind };

export type AreaProgressRow = {
  scope: string;
  label: string;
  kind?: CoverageScopeKind;
  backfilled_at: string | null;
  progress: string | null;
  progress_at: string | null;
  items_found: number | null;
  items_analyzed: number | null;
  items_failed: number | null;
};

export type AreaPhase = "queued" | "fetching" | "analyzing" | "ready" | "retry";

export type CitySupport =
  | { supported: true; name: string; scope: string }
  | { supported: false; place: string | null; supportedCities: string[] };

/** The coverage scopes behind a user's feed: their state and their city's council. */
export function areasFor(state: string | null | undefined, jurisdictionIds: string[]): Area[] {
  const areas: Area[] = [];
  if (state) areas.push({ scope: stateScope(state), label: `${state} bills`, kind: "state" });
  for (const src of LOCAL_SOURCES) {
    if (jurisdictionIds.includes(src.jurisdictionId)) {
      areas.push({ scope: citySourceScope(src), label: `${src.name} council items`, kind: "city" });
    }
  }
  return areas;
}

/** Whether city council agenda ingestion is connected for this ZIP's city. */
export function citySupportFor(jurisdictionIds: string[]): CitySupport {
  const src = LOCAL_SOURCES.find((candidate) => jurisdictionIds.includes(candidate.jurisdictionId));
  if (src) return { supported: true, name: src.name, scope: citySourceScope(src) };
  return {
    supported: false,
    place: placeName(jurisdictionIds, null),
    supportedCities: LOCAL_SOURCES.map((s) => s.name),
  };
}

export function areaScopeKind(area: Pick<AreaProgressRow, "scope" | "kind">): CoverageScopeKind {
  return area.kind ?? (area.scope.startsWith("legistar:") ? "city" : "state");
}

export function areaPhase(area: Pick<AreaProgressRow, "backfilled_at" | "progress" | "progress_at">, now: number): AreaPhase {
  if (area.progress === "ready" || (area.backfilled_at && !area.progress)) return "ready";
  if (area.progress === "retry") return "retry";
  if (area.progress_at && now - Date.parse(area.progress_at) > STALE_PROGRESS_MS) return "retry";
  if (area.progress === "fetching" || area.progress === "analyzing") return area.progress;
  return "queued";
}

export function isPhaseInProgress(phase: AreaPhase): boolean {
  return phase === "queued" || phase === "fetching" || phase === "analyzing";
}

export const INDEX_STAGES = ["Queued", "Fetching", "Analyzing", "Ready"] as const;

export function areaStageIndex(phase: AreaPhase): 0 | 1 | 2 | 3 {
  switch (phase) {
    case "ready":
      return 3;
    case "analyzing":
      return 2;
    case "fetching":
      return 1;
    default:
      return 0;
  }
}

export function areaProgressPercent(
  area: Pick<AreaProgressRow, "items_found" | "items_analyzed" | "items_failed">,
  phase: AreaPhase,
): number {
  switch (phase) {
    case "ready":
      return 100;
    case "retry":
      return 0;
    case "queued":
      return 10;
    case "fetching":
      return area.items_found && area.items_found > 0 ? 30 : 22;
    case "analyzing": {
      const found = area.items_found ?? 0;
      if (found <= 0) return 35;
      const done = Math.min(found, (area.items_analyzed ?? 0) + (area.items_failed ?? 0));
      return Math.min(99, 35 + Math.round((done / found) * 64));
    }
  }
}

export function overallProgressPercent(
  rows: { area: Pick<AreaProgressRow, "items_found" | "items_analyzed" | "items_failed">; phase: AreaPhase }[],
): number {
  if (!rows.length) return 100;
  const total = rows.reduce((sum, row) => sum + areaProgressPercent(row.area, row.phase), 0);
  return Math.round(total / rows.length);
}

export function areaPhaseDetail(
  area: Pick<AreaProgressRow, "items_found" | "items_analyzed" | "items_failed">,
  phase: AreaPhase,
): string {
  const analyzed = area.items_analyzed ?? 0;
  const failed = area.items_failed ?? 0;
  const found = area.items_found ?? 0;

  switch (phase) {
    case "ready":
      if (area.items_found === null) return "Indexed";
      if (found === 0) return "No recent items found";
      return `${analyzed} of ${found} analyzed${failed ? ` · ${failed} could not be analyzed` : ""}`;
    case "analyzing":
      return found ? `Analyzing · ${analyzed} of ${found} ready` : "Preparing items for analysis";
    case "fetching":
      return found ? `Fetching recent items · ${found} found` : "Fetching recent items…";
    case "retry":
      return "Scheduled for the next indexing run";
    default:
      return "Starting indexing…";
  }
}

export type ProgressSummary = {
  label: string;
  detail: string;
  percent: number;
  inProgress: boolean;
};

export function formatProgressSummary(
  rows: { area: AreaProgressRow; phase: AreaPhase }[] | null,
): ProgressSummary | null {
  if (!rows?.length) return null;
  const activeRow = rows.find(({ phase }) => isPhaseInProgress(phase)) ?? rows.find(({ phase }) => phase !== "ready");
  if (!activeRow) return null;
  return {
    label: activeRow.area.label,
    detail: areaPhaseDetail(activeRow.area, activeRow.phase),
    percent: areaProgressPercent(activeRow.area, activeRow.phase),
    inProgress: isPhaseInProgress(activeRow.phase),
  };
}

export function summarizeCoverage(areas: AreaProgressRow[] | null, now: number) {
  const rows = areas
    ? areas.map((area) => ({ area, phase: areaPhase(area, now), kind: areaScopeKind(area) }))
    : null;
  return {
    rows,
    hasIncomplete: !rows || rows.some(({ phase }) => phase !== "ready"),
    inProgress: rows?.some(({ phase }) => isPhaseInProgress(phase)) ?? false,
    cityInProgress: rows?.some(({ kind, phase }) => kind === "city" && isPhaseInProgress(phase)) ?? false,
    cityPending: rows?.some(({ kind, phase }) => kind === "city" && phase !== "ready") ?? false,
    stateInProgress: rows?.some(({ kind, phase }) => kind === "state" && isPhaseInProgress(phase)) ?? false,
    statePending: rows?.some(({ kind, phase }) => kind === "state" && phase !== "ready") ?? false,
  };
}

export function formatList(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
