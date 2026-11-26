"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui";
import type { AreaProgress } from "@/lib/data";

function status(area: AreaProgress, now: number) {
  if (area.progress === "ready" || (area.backfilled_at && !area.progress)) return "ready";
  if (area.progress === "retry") return "retry";
  if (area.progress_at && now - Date.parse(area.progress_at) > 65 * 60 * 1000) return "retry";
  return area.progress ?? "queued";
}

function detail(area: AreaProgress, phase: string) {
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
      return "Looking for recent items";
    case "retry":
      return "Paused until the next indexing run";
    default:
      return "Queued for indexing";
  }
}

export function LocalIndexProgress({
  areas,
  zip,
  now,
  showWhenReady = false,
}: {
  areas: AreaProgress[] | null;
  zip: string | null;
  now: number;
  showWhenReady?: boolean;
}) {
  const router = useRouter();
  const rows = areas?.map((area) => ({ area, phase: status(area, now) }));
  const active = !rows || rows.some(({ phase }) => phase !== "ready");
  const working = rows?.some(({ phase }) => phase === "fetching" || phase === "analyzing") ?? false;

  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, working ? 15_000 : 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, working, router]);

  if (rows?.length === 0) return null;
  if (!showWhenReady && rows && !active) return null;

  return (
    <Card className="mb-6 border-accent/30 bg-accent-soft/25 text-sm">
      <div className="flex items-center gap-2">
        {working && <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />}
        <h2 className="font-semibold">Indexing recent items{zip ? ` for ZIP ${zip}` : ""}</h2>
      </div>
      {rows ? (
        <ul className="mt-2.5 space-y-2.5" aria-live="polite">
          {rows.map(({ area, phase }) => {
            const pct = area.items_found ? Math.min(100, Math.round(((area.items_analyzed ?? 0) / area.items_found) * 100)) : 0;
            return (
              <li key={area.scope}>
                <div className="flex flex-wrap justify-between gap-x-4 text-xs sm:text-sm">
                  <span className="font-medium">{area.label}</span>
                  <span className="tabular-nums text-muted">{detail(area, phase)}</span>
                </div>
                {phase === "analyzing" && !!area.items_found && (
                  <div
                    className="mt-1.5 h-2 overflow-hidden rounded-full bg-line"
                    role="progressbar"
                    aria-label={`Items analyzed for ${area.label}`}
                    aria-valuemin={0}
                    aria-valuemax={area.items_found}
                    aria-valuenow={area.items_analyzed ?? 0}
                  >
                    <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-muted">Indexing status is temporarily unavailable.</p>
      )}
    </Card>
  );
}
