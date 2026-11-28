"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, RefreshCw, X } from "lucide-react";
import { Card, Pill, cx } from "@/components/ui";
import type { AreaProgress } from "@/lib/data";
import {
  INDEX_STAGES,
  areaPhaseDetail,
  areaProgressPercent,
  areaStageIndex,
  formatList,
  isPhaseInProgress,
  overallProgressPercent,
  summarizeCoverage,
  type CitySupport,
} from "@/lib/coverageStatus";

const SWITCH_STORAGE_KEY = "civicsteps:zip-switched";
const consumedSwitchZips = new Set<string>();

type CoveragePayload = {
  zip: string | null;
  place: string | null;
  citySupport: CitySupport | null;
  areas: AreaProgress[] | null;
  now: number;
};

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
  const [live, setLive] = useState<{
    zip: string | null;
    areas: AreaProgress[] | null;
    now: number;
    place: string | null | undefined;
    citySupport: CitySupport | undefined;
  }>({ zip, areas, now, place, citySupport });
  const [justSwitched, setJustSwitched] = useState(false);
  const [completedDuringSession, setCompletedDuringSession] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const sawActiveRef = useRef(false);
  const latestRef = useRef(live);
  latestRef.current = live;

  useEffect(() => {
    setLive({ zip, areas, now, place, citySupport });
  }, [zip, areas, now, place, citySupport]);

  useEffect(() => {
    sawActiveRef.current = false;
    setDismissed(false);
    setCompletedDuringSession(false);
    if (!zip) {
      setJustSwitched(false);
      return;
    }
    if (consumedSwitchZips.has(zip)) {
      setJustSwitched(true);
      return;
    }
    try {
      if (window.sessionStorage.getItem(SWITCH_STORAGE_KEY) === zip) {
        consumedSwitchZips.add(zip);
        window.sessionStorage.removeItem(SWITCH_STORAGE_KEY);
        setJustSwitched(true);
      } else {
        setJustSwitched(false);
      }
    } catch {
      setJustSwitched(false);
    }
  }, [zip]);

  const currentZip = live.zip ?? zip;
  const currentPlace = live.place !== undefined ? live.place : place;
  const currentCitySupport = live.citySupport ?? citySupport;
  const summary = summarizeCoverage(live.areas, live.now);
  const { rows, hasIncomplete: active, inProgress } = summary;

  useEffect(() => {
    if (active) sawActiveRef.current = true;
  }, [active]);

  const pollCoverage = useCallback(
    async (manual = false) => {
      if (manual) setRefreshing(true);
      try {
        const res = await fetch("/api/coverage", { cache: "no-store" });
        if (!res.ok) return;
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) return;
        const data = (await res.json()) as CoveragePayload;
        const prev = latestRef.current;
        const prevSummary = summarizeCoverage(prev.areas, prev.now);
        const nextSummary = summarizeCoverage(data.areas, data.now);

        const prevAnalyzed = (prev.areas ?? []).reduce((sum, a) => sum + (a.items_analyzed ?? 0), 0);
        const nextAnalyzed = (data.areas ?? []).reduce((sum, a) => sum + (a.items_analyzed ?? 0), 0);
        const prevReady = (prevSummary.rows ?? []).filter((r) => r.phase === "ready").length;
        const nextReady = (nextSummary.rows ?? []).filter((r) => r.phase === "ready").length;

        setLive({
          zip: data.zip ?? prev.zip,
          areas: data.areas,
          now: data.now,
          place: data.place ?? prev.place,
          citySupport: data.citySupport ?? prev.citySupport,
        });

        if (sawActiveRef.current && prevSummary.hasIncomplete && !nextSummary.hasIncomplete) {
          setCompletedDuringSession(true);
        }

        if (
          data.zip !== prev.zip ||
          nextAnalyzed > prevAnalyzed ||
          nextReady > prevReady ||
          (prevSummary.hasIncomplete && !nextSummary.hasIncomplete)
        ) {
          router.refresh();
        }
      } catch {
        // Polling is best-effort; ignore transient network errors.
      } finally {
        if (manual) setRefreshing(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void pollCoverage(false);
    };
    const timer = window.setInterval(refresh, inProgress ? 5_000 : 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, inProgress, pollCoverage]);

  if (!currentZip) return null;
  if (dismissed && !showWhenReady && !active) return null;
  if (rows?.length === 0 && (!currentCitySupport || currentCitySupport.supported) && !showWhenReady && !justSwitched) {
    return null;
  }
  if (!showWhenReady && !justSwitched && !completedDuringSession && rows && !active) return null;

  const overallPct = rows ? overallProgressPercent(rows) : 0;
  const showAllSourcesSummary = showWhenReady || justSwitched || completedDuringSession;

  return (
    <Card
      className={cx(
        "mb-6 text-sm",
        active
          ? "border-accent/30 bg-accent-soft/25"
          : completedDuringSession || justSwitched
            ? "border-benefit/30 bg-benefit-soft/20"
            : "border-line bg-card",
      )}
    >
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
            {active
              ? "Indexing recent items"
              : completedDuringSession
                ? "Indexing complete"
                : "Location coverage"}{" "}
            for ZIP {currentZip}
            {currentPlace ? ` (${currentPlace})` : ""}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {inProgress ? (
            <Pill tone="accent" className="tabular-nums">
              In progress · {overallPct}%
            </Pill>
          ) : active && rows ? (
            <Pill tone="neutral">Scheduled</Pill>
          ) : (
            <Pill tone="benefit">Indexed</Pill>
          )}
          {active && (
            <button
              type="button"
              onClick={() => void pollCoverage(true)}
              disabled={refreshing}
              aria-label="Refresh indexing status"
              className="inline-flex items-center gap-1 rounded-md border border-line bg-card px-2 py-1 text-xs font-medium text-muted transition hover:border-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
            >
              <RefreshCw className={cx("h-3 w-3", refreshing && "animate-spin")} aria-hidden />
              <span>Refresh</span>
            </button>
          )}
          {!active && !showWhenReady && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss indexing status"
              className="rounded-md p-1 text-muted transition hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {inProgress && (
        <p className="mt-1.5 text-xs text-muted">
          We&apos;re gathering and analyzing recent items for this location. This page updates automatically as items arrive.
        </p>
      )}
      {!inProgress && active && rows && (
        <p className="mt-1.5 text-xs text-muted">
          Indexing is scheduled for the next run. This page will update automatically once items are analyzed.
        </p>
      )}
      {!active && completedDuringSession && (
        <p className="mt-1.5 text-xs text-muted">
          All available items for this ZIP code have been analyzed and added to your feed.
        </p>
      )}
      {!active && !completedDuringSession && justSwitched && (
        <p className="mt-1.5 text-xs text-muted">
          All available items for this location are indexed and ready in your feed.
        </p>
      )}

      {rows ? (
        <ul className="mt-3 space-y-3" aria-live="polite">
          {rows.map(({ area, phase }) => {
            const pct = areaProgressPercent(area, phase);
            const rowInProgress = isPhaseInProgress(phase);
            const stageIndex = areaStageIndex(phase);
            const isIndeterminatePulse = rowInProgress && (phase === "queued" || phase === "fetching" || !area.items_found);
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
                  <span className="tabular-nums text-muted">
                    {areaPhaseDetail(area, phase)}
                    {rowInProgress && <span className="ml-1.5 font-medium text-accent">{pct}%</span>}
                  </span>
                </div>

                {(rowInProgress || phase === "retry") && (
                  <ol className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted" aria-label={`${area.label} stages`}>
                    {INDEX_STAGES.map((stage, i) => {
                      const reached = rowInProgress && i < stageIndex;
                      const current = rowInProgress && i === stageIndex;
                      return (
                        <li key={stage} className="inline-flex items-center gap-1">
                          {i > 0 && (
                            <span aria-hidden className="text-muted/60">
                              →
                            </span>
                          )}
                          <span
                            className={cx(
                              "rounded px-1.5 py-0.5",
                              current && "bg-accent-soft font-medium text-accent",
                              reached && "font-medium text-benefit",
                              !current && !reached && "text-muted/80",
                            )}
                          >
                            {stage}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}

                <div
                  className={cx("mt-1.5 overflow-hidden rounded-full bg-line", rowInProgress ? "h-2" : "h-1.5")}
                  role="progressbar"
                  aria-label={`Indexing progress for ${area.label}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                >
                  <div
                    className={cx(
                      "h-full rounded-full transition-all duration-300",
                      phase === "ready" ? "bg-benefit" : "bg-accent",
                      isIndeterminatePulse && "animate-pulse",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}

          {showAllSourcesSummary && (
            <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs sm:text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-benefit" aria-hidden />
                Federal bills &amp; comment periods
              </span>
              <span className="text-muted">Indexed</span>
            </li>
          )}

          {currentCitySupport && !currentCitySupport.supported && currentCitySupport.place && (
            <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs sm:text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium text-muted">
                <Clock className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                {currentCitySupport.place} council items
              </span>
              <span className="text-muted">Not connected</span>
            </li>
          )}
        </ul>
      ) : (
        <p className="mt-2 text-muted">Indexing status is temporarily unavailable.</p>
      )}

      {currentCitySupport && !currentCitySupport.supported && (
        <p className="mt-3 border-t border-line/70 pt-2.5 text-xs text-muted">
          {currentCitySupport.place
            ? `City council agendas aren't connected for ${currentCitySupport.place} yet, so city-level items aren't being indexed for this ZIP. CivicSteps currently connects ${formatList(currentCitySupport.supportedCities)} — your state bills and federal items are still covered.`
            : "This ZIP code isn't inside a covered city boundary, so city council items aren't indexed here — state bills and federal items are still covered."}
        </p>
      )}
    </Card>
  );
}
