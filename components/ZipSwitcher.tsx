"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Clock, Loader2, MapPin, Trash2 } from "lucide-react";
import { removeZip, saveZip } from "@/app/zip-actions";
import { Button } from "@/components/ui";
import { formatList, type ProgressSummary } from "@/lib/coverageStatus";

type Location = { zip: string; place: string | null };

const SWITCH_STORAGE_KEY = "civicsteps:zip-switched";

export function ZipSwitcher({
  active,
  saved,
  indexing = false,
  indexingSummary = null,
}: {
  active: string | null;
  saved: Location[];
  indexing?: boolean;
  indexingSummary?: ProgressSummary | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const [zip, setZip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [removingZip, setRemovingZip] = useState<string | null>(null);
  const [removedZips, setRemovedZips] = useState<Set<string>>(() => new Set());
  const [pending, start] = useTransition();

  useEffect(() => {
    setRemovedZips(new Set());
  }, [saved]);

  if (!["/feed", "/browse", "/reps", "/profile"].includes(pathname)) return null;

  const busy = pending || statusText !== null || removingZip !== null;
  const showIndexing = indexingSummary?.inProgress ?? indexing;
  const visibleSaved = saved.filter((location) => !removedZips.has(location.zip));

  function close() {
    if (details.current) details.current.open = false;
    summary.current?.focus();
  }

  function reloadForLocation(citySupported: boolean) {
    const url = new URL(window.location.href);
    if (url.pathname === "/feed" && url.searchParams.get("level") === "city" && !citySupported) {
      url.searchParams.delete("level");
      window.location.replace(url);
    } else if (url.pathname === "/browse" && url.searchParams.has("page")) {
      url.searchParams.delete("page");
      window.location.replace(url);
    } else {
      window.location.reload();
    }
  }

  function activate(value: string) {
    setError(null);
    setStatusText("Setting active ZIP…");
    start(async () => {
      try {
        const result = await saveZip(value);
        if (!result.ok) {
          setStatusText(null);
          setError(result.error);
          return;
        }
        try {
          window.sessionStorage.setItem(SWITCH_STORAGE_KEY, result.zip);
        } catch {
          // Ignore storage unavailability (e.g. private mode restrictions).
        }
        setStatusText(
          result.coverage?.length
            ? `Starting indexing for ${formatList(result.coverage)}…`
            : "Updating your view…",
        );
        reloadForLocation(result.citySupport.supported);
      } catch {
        setStatusText(null);
        setError("Couldn't set your active ZIP code. Try again in a moment.");
      }
    });
  }

  function handleRemove(targetZip: string) {
    setError(null);
    setRemovingZip(targetZip);
    setStatusText(`Removing ZIP ${targetZip}…`);
    start(async () => {
      try {
        const result = await removeZip(targetZip);
        if (!result.ok) {
          setRemovingZip(null);
          setStatusText(null);
          setError(result.error);
          return;
        }
        if (!result.wasActive) {
          setRemovedZips((prev) => new Set([...prev, targetZip]));
          setRemovingZip(null);
          setStatusText(null);
          router.refresh();
          return;
        }
        if (result.activeZip) {
          try {
            window.sessionStorage.setItem(SWITCH_STORAGE_KEY, result.activeZip);
          } catch {
            // Ignore storage unavailability.
          }
        }
        setStatusText(result.activeZip ? `Switched to ZIP ${result.activeZip}…` : "Updating your view…");
        reloadForLocation(Boolean(result.activeZip && result.citySupport?.supported));
      } catch {
        setRemovingZip(null);
        setStatusText(null);
        setError("Couldn't remove that ZIP code. Try again in a moment.");
      }
    });
  }

  return (
    <details
      ref={details}
      className="group relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && details.current?.open) close();
      }}
      onToggle={() => {
        if (!details.current?.open) {
          setError(null);
          setStatusText(null);
        }
      }}
    >
      <summary
        ref={summary}
        title={
          indexingSummary
            ? `${indexingSummary.label}: ${indexingSummary.detail}`
            : showIndexing
              ? "Indexing recent items for this ZIP"
              : undefined
        }
        className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 font-medium hover:border-accent focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"
      >
        <MapPin className="h-4 w-4 text-accent" aria-hidden />
        <span aria-live="polite">{active ? `ZIP ${active}` : "Add a ZIP"}</span>
        {showIndexing && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden />
            {indexingSummary && (
              <span className="text-xs font-medium tabular-nums text-accent">{indexingSummary.percent}%</span>
            )}
            <span className="sr-only">Indexing in progress</span>
          </>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted group-open:rotate-180" aria-hidden />
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-card p-3 shadow-lg">
        {(indexingSummary || showIndexing) && !statusText && (
          <div role="status" className="mb-3 rounded-lg bg-accent-soft/50 px-2.5 py-2 text-xs text-ink">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-medium">
                {showIndexing ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" aria-hidden />
                ) : (
                  <Clock className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                )}
                <span>
                  {indexingSummary ? indexingSummary.label : `Indexing recent items${active ? ` for ZIP ${active}` : ""}…`}
                </span>
              </span>
              {indexingSummary?.inProgress && (
                <span className="tabular-nums text-accent">{indexingSummary.percent}%</span>
              )}
            </div>
            {indexingSummary && (
              <>
                <p className="mt-1 text-[11px] text-muted">{indexingSummary.detail}</p>
                {indexingSummary.inProgress && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-300"
                      style={{ width: `${indexingSummary.percent}%` }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {visibleSaved.length > 0 && (
          <>
            <p className="px-2 pb-1 text-xs font-medium text-muted">Saved ZIP codes</p>
            <ul className="mb-3 max-h-52 space-y-0.5 overflow-y-auto">
              {visibleSaved.map((location) => {
                const isActive = location.zip === active;
                const isRemoving = removingZip === location.zip;
                return (
                  <li key={location.zip} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => activate(location.zip)}
                      disabled={busy || isActive}
                      className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 py-2 text-left ${isActive ? "bg-accent-soft text-accent" : "hover:bg-paper disabled:opacity-60"}`}
                    >
                      <span className="min-w-0">
                        <span className="block font-medium tabular-nums">{location.zip}</span>
                        {location.place && <span className="block truncate text-xs text-muted">{location.place}</span>}
                      </span>
                      {isActive && <span className="shrink-0 text-xs font-medium">Active</span>}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(location.zip)}
                      disabled={busy}
                      aria-label={`Remove ZIP ${location.zip}`}
                      title={`Remove ZIP ${location.zip}`}
                      className="shrink-0 rounded-lg p-2 text-muted transition hover:bg-cost-soft hover:text-cost focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
                    >
                      {isRemoving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <form
          className={visibleSaved.length ? "border-t border-line pt-3" : undefined}
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) activate(zip);
          }}
        >
          <label htmlFor="switcher-zip" className="text-sm font-medium">Add a ZIP code</label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="switcher-zip"
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-2 focus:border-accent"
              value={zip}
              onChange={(event) => { setZip(event.target.value); setError(null); }}
              inputMode="numeric"
              maxLength={10}
              placeholder="Enter ZIP code"
              disabled={busy}
              required
            />
            <Button type="submit" disabled={busy || !zip.trim()}>Add</Button>
          </div>
          <p className="mt-2 text-xs text-muted">Your active ZIP sets your local feed, representatives, alerts, and weekly digest.</p>
        </form>
        {statusText && (
          <p role="status" className="mt-2 flex items-center gap-1.5 text-sm text-muted">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" aria-hidden />
            {statusText}
          </p>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-urgent">{error}</p>}
      </div>
    </details>
  );
}
