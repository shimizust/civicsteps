import { describe, expect, it } from "vitest";
import {
  INDEX_STAGES,
  areaPhase,
  areaPhaseDetail,
  areaProgressPercent,
  areaStageIndex,
  areasFor,
  citySupportFor,
  formatList,
  formatProgressSummary,
  isPhaseInProgress,
  overallProgressPercent,
  STALE_PROGRESS_MS,
  summarizeCoverage,
  type AreaProgressRow,
} from "@/lib/coverageStatus";

const now = Date.parse("2026-11-27T12:00:00Z");

function row(over: Partial<AreaProgressRow> = {}): AreaProgressRow {
  return {
    scope: "state:WA",
    label: "WA bills",
    kind: "state",
    backfilled_at: null,
    progress: null,
    progress_at: null,
    items_found: null,
    items_analyzed: null,
    items_failed: null,
    ...over,
  };
}

describe("areasFor", () => {
  it("includes state and supported Legistar cities", () => {
    expect(areasFor("WA", ["ocd-division/country:us/state:wa/place:seattle"])).toEqual([
      { scope: "state:WA", label: "WA bills", kind: "state" },
      { scope: "legistar:seattle", label: "Seattle council items", kind: "city" },
    ]);
    expect(areasFor("CA", ["ocd-division/country:us/state:ca/place:sunnyvale"])).toEqual([
      { scope: "state:CA", label: "CA bills", kind: "state" },
      { scope: "legistar:sunnyvaleca", label: "Sunnyvale council items", kind: "city" },
    ]);
  });

  it("includes only state when city is not in LOCAL_SOURCES", () => {
    expect(areasFor("CA", ["ocd-division/country:us/state:ca/place:san_francisco"])).toEqual([
      { scope: "state:CA", label: "CA bills", kind: "state" },
    ]);
  });

  it("handles missing or empty state", () => {
    expect(areasFor(null, ["ocd-division/country:us"])).toEqual([]);
    expect(areasFor("", ["ocd-division/country:us/state:wa/place:seattle"])).toEqual([
      { scope: "legistar:seattle", label: "Seattle council items", kind: "city" },
    ]);
  });
});

describe("citySupportFor", () => {
  it("identifies supported Legistar cities", () => {
    expect(citySupportFor(["ocd-division/country:us/state:wa/place:seattle"])).toEqual({
      supported: true,
      name: "Seattle",
      scope: "legistar:seattle",
    });
    expect(citySupportFor(["ocd-division/country:us/state:ca/place:sunnyvale"])).toEqual({
      supported: true,
      name: "Sunnyvale",
      scope: "legistar:sunnyvaleca",
    });
  });

  it("returns place name and supported city list for unsupported cities", () => {
    expect(citySupportFor(["ocd-division/country:us/state:ca/place:san_francisco"])).toEqual({
      supported: false,
      place: "San Francisco",
      supportedCities: ["Seattle", "Sunnyvale"],
    });
    expect(citySupportFor(["ocd-division/country:us/state:co/place:denver"])).toEqual({
      supported: false,
      place: "Denver",
      supportedCities: ["Seattle", "Sunnyvale"],
    });
  });

  it("returns place: null for unincorporated ZIPs without a place division", () => {
    expect(citySupportFor(["ocd-division/country:us", "ocd-division/country:us/state:wa/county:king"])).toEqual({
      supported: false,
      place: null,
      supportedCities: ["Seattle", "Sunnyvale"],
    });
  });
});

describe("areaPhase and isPhaseInProgress", () => {
  it("resolves ready, legacy ready, retry, fetching, analyzing, and queued phases", () => {
    expect(areaPhase(row({ progress: "ready", backfilled_at: "2026-11-27T11:00:00Z" }), now)).toBe("ready");
    expect(areaPhase(row({ progress: null, backfilled_at: "2026-11-27T11:00:00Z" }), now)).toBe("ready");
    expect(areaPhase(row({ progress: "retry" }), now)).toBe("retry");
    expect(areaPhase(row({ progress: "fetching", progress_at: new Date(now - 5_000).toISOString() }), now)).toBe("fetching");
    expect(areaPhase(row({ progress: "analyzing", progress_at: new Date(now - 5_000).toISOString() }), now)).toBe("analyzing");
    expect(areaPhase(row({ progress: null, progress_at: new Date(now - 5_000).toISOString() }), now)).toBe("queued");
    expect(areaPhase(row({ progress: null, progress_at: null }), now)).toBe("queued");
  });

  it("treats stale progress_at past 65 minutes as retry", () => {
    const exactBoundary = new Date(now - STALE_PROGRESS_MS).toISOString();
    const pastBoundary = new Date(now - STALE_PROGRESS_MS - 1).toISOString();
    expect(areaPhase(row({ progress: "fetching", progress_at: exactBoundary }), now)).toBe("fetching");
    expect(areaPhase(row({ progress: "fetching", progress_at: pastBoundary }), now)).toBe("retry");
    expect(areaPhase(row({ progress: null, progress_at: pastBoundary }), now)).toBe("retry");
  });

  it("marks queued, fetching, and analyzing as in progress", () => {
    expect(isPhaseInProgress("queued")).toBe(true);
    expect(isPhaseInProgress("fetching")).toBe(true);
    expect(isPhaseInProgress("analyzing")).toBe(true);
    expect(isPhaseInProgress("ready")).toBe(false);
    expect(isPhaseInProgress("retry")).toBe(false);
  });
});

describe("areaPhaseDetail and formatList", () => {
  it("formats clear phase status text", () => {
    expect(areaPhaseDetail(row(), "queued")).toBe("Starting indexing…");
    expect(areaPhaseDetail(row(), "fetching")).toBe("Fetching recent items…");
    expect(areaPhaseDetail(row({ items_found: 18 }), "fetching")).toBe("Fetching recent items · 18 found");
    expect(areaPhaseDetail(row(), "retry")).toBe("Scheduled for the next indexing run");
    expect(areaPhaseDetail(row(), "analyzing")).toBe("Preparing items for analysis");
    expect(areaPhaseDetail(row({ items_found: 12, items_analyzed: 5 }), "analyzing")).toBe("Analyzing · 5 of 12 ready");
    expect(areaPhaseDetail(row(), "ready")).toBe("Indexed");
    expect(areaPhaseDetail(row({ items_found: 0 }), "ready")).toBe("No recent items found");
    expect(areaPhaseDetail(row({ items_found: 10, items_analyzed: 8, items_failed: 2 }), "ready")).toBe(
      "8 of 10 analyzed · 2 could not be analyzed",
    );
  });

  it("formats lists with natural conjunctions", () => {
    expect(formatList([])).toBe("");
    expect(formatList(["WA bills"])).toBe("WA bills");
    expect(formatList(["Seattle", "Sunnyvale"])).toBe("Seattle and Sunnyvale");
    expect(formatList(["WA bills", "Seattle council items", "CA bills"])).toBe(
      "WA bills, Seattle council items and CA bills",
    );
  });
});

describe("summarizeCoverage", () => {
  it("handles null and empty coverage lists", () => {
    expect(summarizeCoverage(null, now)).toEqual({
      rows: null,
      hasIncomplete: true,
      inProgress: false,
      cityInProgress: false,
      cityPending: false,
      stateInProgress: false,
      statePending: false,
    });
    expect(summarizeCoverage([], now)).toEqual({
      rows: [],
      hasIncomplete: false,
      inProgress: false,
      cityInProgress: false,
      cityPending: false,
      stateInProgress: false,
      statePending: false,
    });
  });

  it("tracks queued city with ready state", () => {
    const summary = summarizeCoverage(
      [
        row({ scope: "state:WA", label: "WA bills", kind: "state", progress: "ready", backfilled_at: "2026-11-27T10:00:00Z" }),
        row({ scope: "legistar:seattle", label: "Seattle council items", kind: "city", progress: null }),
      ],
      now,
    );
    expect(summary.hasIncomplete).toBe(true);
    expect(summary.inProgress).toBe(true);
    expect(summary.cityInProgress).toBe(true);
    expect(summary.cityPending).toBe(true);
    expect(summary.stateInProgress).toBe(false);
    expect(summary.statePending).toBe(false);
  });

  it("tracks queued state without a city scope", () => {
    const summary = summarizeCoverage([row({ scope: "state:CO", label: "CO bills", kind: "state", progress: null })], now);
    expect(summary.hasIncomplete).toBe(true);
    expect(summary.inProgress).toBe(true);
    expect(summary.cityInProgress).toBe(false);
    expect(summary.cityPending).toBe(false);
    expect(summary.stateInProgress).toBe(true);
    expect(summary.statePending).toBe(true);
  });

  it("distinguishes retry from active progress", () => {
    const summary = summarizeCoverage([row({ scope: "state:CO", label: "CO bills", kind: "state", progress: "retry" })], now);
    expect(summary.hasIncomplete).toBe(true);
    expect(summary.inProgress).toBe(false);
    expect(summary.stateInProgress).toBe(false);
    expect(summary.statePending).toBe(true);
  });

  it("marks everything complete when all rows are ready", () => {
    const summary = summarizeCoverage(
      [
        row({ scope: "state:WA", label: "WA bills", kind: "state", progress: "ready", backfilled_at: "2026-11-27T10:00:00Z" }),
        row({
          scope: "legistar:seattle",
          label: "Seattle council items",
          kind: "city",
          progress: "ready",
          backfilled_at: "2026-11-27T10:05:00Z",
        }),
      ],
      now,
    );
    expect(summary.hasIncomplete).toBe(false);
    expect(summary.inProgress).toBe(false);
    expect(summary.cityInProgress).toBe(false);
    expect(summary.cityPending).toBe(false);
    expect(summary.stateInProgress).toBe(false);
    expect(summary.statePending).toBe(false);
  });
});

describe("stage and percent helpers", () => {
  it("maps phases to pipeline stage indices", () => {
    expect(INDEX_STAGES).toEqual(["Queued", "Fetching", "Analyzing", "Ready"]);
    expect(areaStageIndex("queued")).toBe(0);
    expect(areaStageIndex("retry")).toBe(0);
    expect(areaStageIndex("fetching")).toBe(1);
    expect(areaStageIndex("analyzing")).toBe(2);
    expect(areaStageIndex("ready")).toBe(3);
  });

  it("computes incremental area and overall percentages", () => {
    expect(areaProgressPercent(row(), "retry")).toBe(0);
    expect(areaProgressPercent(row(), "queued")).toBe(10);
    expect(areaProgressPercent(row(), "fetching")).toBe(22);
    expect(areaProgressPercent(row({ items_found: 24 }), "fetching")).toBe(30);
    expect(areaProgressPercent(row(), "analyzing")).toBe(35);
    expect(areaProgressPercent(row({ items_found: 10, items_analyzed: 0, items_failed: 0 }), "analyzing")).toBe(35);
    expect(areaProgressPercent(row({ items_found: 10, items_analyzed: 5, items_failed: 0 }), "analyzing")).toBe(67);
    expect(areaProgressPercent(row({ items_found: 10, items_analyzed: 8, items_failed: 2 }), "analyzing")).toBe(99);
    expect(areaProgressPercent(row({ items_found: 10, items_analyzed: 10, items_failed: 0 }), "ready")).toBe(100);

    expect(overallProgressPercent([])).toBe(100);
    expect(
      overallProgressPercent([
        { area: row({ items_found: 10, items_analyzed: 10 }), phase: "ready" },
        { area: row({ items_found: 10, items_analyzed: 5 }), phase: "analyzing" },
      ]),
    ).toBe(84);
  });

  it("formats compact progress summaries prioritizing active indexing over retry", () => {
    expect(formatProgressSummary(null)).toBeNull();
    expect(formatProgressSummary([{ area: row({ progress: "ready" }), phase: "ready" }])).toBeNull();

    const activeOverRetry = formatProgressSummary([
      { area: row({ scope: "state:CA", label: "CA bills", progress: "retry" }), phase: "retry" },
      {
        area: row({
          scope: "legistar:sunnyvaleca",
          label: "Sunnyvale council items",
          progress: "analyzing",
          items_found: 20,
          items_analyzed: 10,
        }),
        phase: "analyzing",
      },
    ]);
    expect(activeOverRetry).toEqual({
      label: "Sunnyvale council items",
      detail: "Analyzing · 10 of 20 ready",
      percent: 67,
      inProgress: true,
    });

    const retryOnly = formatProgressSummary([
      { area: row({ scope: "state:CA", label: "CA bills", progress: "retry" }), phase: "retry" },
    ]);
    expect(retryOnly).toEqual({
      label: "CA bills",
      detail: "Scheduled for the next indexing run",
      percent: 0,
      inProgress: false,
    });
  });
});
