"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Trash2 } from "lucide-react";
import { removeZip, saveZip } from "@/app/zip-actions";
import { Button, Pill } from "@/components/ui";

type SavedLocation = { zip: string; place: string | null };

const SWITCH_STORAGE_KEY = "civicsteps:zip-switched";

export function SavedZipsSection({
  active,
  saved,
}: {
  active: string | null;
  saved: SavedLocation[];
}) {
  const router = useRouter();
  const [removedZips, setRemovedZips] = useState<Set<string>>(() => new Set());
  const [actionZip, setActionZip] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setRemovedZips(new Set());
  }, [saved]);

  const visible = saved.filter((loc) => !removedZips.has(loc.zip));
  const busy = pending || actionZip !== null || statusText !== null;

  function handleSwitch(zip: string) {
    setError(null);
    setActionZip(zip);
    setStatusText(`Switching to ZIP ${zip}…`);
    start(async () => {
      try {
        const result = await saveZip(zip);
        if (!result.ok) {
          setActionZip(null);
          setStatusText(null);
          setError(result.error);
          return;
        }
        try {
          window.sessionStorage.setItem(SWITCH_STORAGE_KEY, result.zip);
        } catch {
          // Ignore storage unavailability.
        }
        window.location.reload();
      } catch {
        setActionZip(null);
        setStatusText(null);
        setError("Couldn't switch your active ZIP code. Try again in a moment.");
      }
    });
  }

  function handleRemove(zip: string) {
    setError(null);
    setActionZip(zip);
    setStatusText(`Removing ZIP ${zip}…`);
    start(async () => {
      try {
        const result = await removeZip(zip);
        if (!result.ok) {
          setActionZip(null);
          setStatusText(null);
          setError(result.error);
          return;
        }
        if (!result.wasActive) {
          setRemovedZips((prev) => new Set([...prev, zip]));
          setActionZip(null);
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
        window.location.reload();
      } catch {
        setActionZip(null);
        setStatusText(null);
        setError("Couldn't remove that ZIP code. Try again in a moment.");
      }
    });
  }

  return (
    <div className="pt-3">
      <p className="font-medium">Saved ZIP codes</p>
      {visible.length > 0 ? (
        <ul className="mt-2.5 space-y-2">
          {visible.map((location) => {
            const isActive = location.zip === active;
            const isActing = actionZip === location.zip;
            return (
              <li
                key={location.zip}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line/80 bg-paper px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  <div className="min-w-0">
                    <span className="font-medium tabular-nums">ZIP {location.zip}</span>
                    {location.place && <span className="ml-1.5 text-xs text-muted">{location.place}</span>}
                  </div>
                  {isActive && <Pill tone="accent">Active</Pill>}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {!isActive && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => handleSwitch(location.zip)}
                      className="!px-2.5 !py-1 text-xs"
                    >
                      Switch
                    </Button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRemove(location.zip)}
                    aria-label={`Remove ZIP ${location.zip}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1 text-xs font-medium text-muted transition hover:border-cost/40 hover:bg-cost-soft hover:text-cost focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
                  >
                    {isActing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    )}
                    <span>Remove</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 text-muted">No saved ZIP codes. Use the ZIP menu above to add one.</p>
      )}
      {statusText && (
        <p role="status" className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" aria-hidden />
          <span>{statusText}</span>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-cost">
          {error}
        </p>
      )}
    </div>
  );
}
