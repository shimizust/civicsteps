"use client";
import { useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Loader2, MapPin } from "lucide-react";
import { saveZip } from "@/app/zip-actions";
import { Button } from "@/components/ui";
import { formatList } from "@/lib/coverageStatus";

type Location = { zip: string; place: string | null };

export function ZipSwitcher({ active, saved, indexing = false }: { active: string | null; saved: Location[]; indexing?: boolean }) {
  const pathname = usePathname();
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const [zip, setZip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!["/feed", "/browse", "/reps", "/profile"].includes(pathname)) return null;

  const busy = pending || statusText !== null;

  function close() {
    if (details.current) details.current.open = false;
    summary.current?.focus();
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
        setStatusText(
          result.coverage?.length
            ? `Starting indexing for ${formatList(result.coverage)}…`
            : "Updating your view…",
        );
        const url = new URL(window.location.href);
        if (url.pathname === "/browse" && url.searchParams.has("page")) {
          url.searchParams.delete("page");
          window.location.replace(url);
        } else {
          window.location.reload();
        }
      } catch {
        setStatusText(null);
        setError("Couldn't set your active ZIP code. Try again in a moment.");
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
        title={indexing ? "Indexing recent items for this ZIP" : undefined}
        className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 font-medium hover:border-accent focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"
      >
        <MapPin className="h-4 w-4 text-accent" aria-hidden />
        <span aria-live="polite">{active ? `ZIP ${active}` : "Add a ZIP"}</span>
        {indexing && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden />
            <span className="sr-only">Indexing in progress</span>
          </>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted group-open:rotate-180" aria-hidden />
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-card p-3 shadow-lg">
        {indexing && !statusText && (
          <p role="status" className="mb-3 flex items-center gap-2 rounded-lg bg-accent-soft/50 px-2.5 py-2 text-xs text-ink">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" aria-hidden />
            <span>Indexing recent items{active ? ` for ZIP ${active}` : ""}…</span>
          </p>
        )}
        {saved.length > 0 && (
          <>
            <p className="px-2 pb-1 text-xs font-medium text-muted">Saved ZIP codes</p>
            <ul className="mb-3 max-h-52 space-y-0.5 overflow-y-auto">
              {saved.map((location) => (
                <li key={location.zip}>
                  <button
                    type="button"
                    onClick={() => activate(location.zip)}
                    disabled={busy || location.zip === active}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left ${location.zip === active ? "bg-accent-soft text-accent" : "hover:bg-paper disabled:opacity-60"}`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{location.zip}</span>
                      {location.place && <span className="block text-xs text-muted">{location.place}</span>}
                    </span>
                    {location.zip === active && <span className="text-xs font-medium">Active</span>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <form
          className={saved.length ? "border-t border-line pt-3" : undefined}
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
