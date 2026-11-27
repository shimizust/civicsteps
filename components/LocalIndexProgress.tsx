"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import type { AreaProgress } from "@/lib/data";
import {
  areaPhaseDetail,
  formatList,
  isPhaseInProgress,
  summarizeCoverage,
  type CitySupport,
} from "@/lib/coverageStatus";

export function LocalIndexProgress({
  areas,
  zip,
  place,
  citySupport,
  now,
  showWhenReady = false,
}: {
  areas: AreaProgress[] | null;
  zip: string | null;
  place?: string | null;
  citySupport?: CitySupport;
  now: number;
  showWhenReady?: boolean;
}) {
  const router = useRouter();
  const summary = summarizeCoverage(areas, now);
  const { rows, hasIncomplete: active, inProgress } = summary;

  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, inProgress ? 15_000 : 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, inProgress, router]);

  if (rows?.length === 0) return null;
  if (!showWhenReady && rows && !active) return null;

  return (
    <Card className="mb-6 border-accent/30 bg-accent-soft/25 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {inProgress ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" aria-hidden />
          ) : active ? (
            <Clock className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-benefit" aria-hidden />
          )}
          <h2 className="font-semibold">
            Indexing recent items{zip ? ` for ZIP ${zip}` : ""}
            {place ? ` (${place})` : ""}
          </h2>
        </div>
        {inProgress ? (
          <Pill tone="accent">In progress</Pill>
        ) : active && rows ? (
          <Pill tone="neutral">Scheduled</Pill>
        ) : null}
      </div>

      {inProgress && (
        <p className="mt-1.5 text-xs text-muted">
          We&apos;re gathering and analyzing recent items for this location. This page updates automatically as items arrive.
        </p>
      )}
      {!inProgress && active && rows && (
        <p className="mt-1.5 text-xs text-muted">
          Indexing is scheduled for the next run. This page will update once items are analyzed.
        </p>
      )}

      {rows ? (
        <ul className="mt-3 space-y-2.5" aria-live="polite">
          {rows.map(({ area, phase }) => {
            const pct = area.items_found ? Math.min(100, Math.round(((area.items_analyzed ?? 0) / area.items_found) * 100)) : 0;
            const rowInProgress = isPhaseInProgress(phase);
            return (
              <li key={area.scope}>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs sm:text-sm">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    {rowInProgress ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" aria-hidden />
                    ) : phase === "ready" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-benefit" aria-hidden />
                    ) : (
                      <Clock className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                    )}
                    {area.label}
                  </span>
                  <span className="tabular-nums text-muted">{areaPhaseDetail(area, phase)}</span>
                </div>
                {phase === "analyzing" && !!area.items_found ? (
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
                ) : rowInProgress ? (
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
                    role="progressbar"
                    aria-label={`${area.label} indexing in progress`}
                  >
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-accent/65" />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-muted">Indexing status is temporarily unavailable.</p>
      )}

      {citySupport && !citySupport.supported && (
        <p className="mt-3 border-t border-line/70 pt-2.5 text-xs text-muted">
          {citySupport.place
            ? `City council items aren't connected for ${citySupport.place} yet (currently ${formatList(citySupport.supportedCities)}). State bills and federal items for your ZIP are still included.`
            : "This ZIP code isn't inside a covered city boundary, so only state bills and federal items apply here."}
        </p>
      )}
    </Card>
  );
}
