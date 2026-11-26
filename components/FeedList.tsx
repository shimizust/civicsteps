"use client";

import { useEffect, useState, useTransition } from "react";
import { RotateCcw, X } from "lucide-react";
import { setRelevance } from "@/app/actions";
import type { Ranked } from "@/lib/relevance";
import type { Database } from "@/lib/supabase/database.types";
import type { Place } from "@/lib/data";
import { ItemCard } from "@/components/ItemCard";
import { Empty } from "@/components/ui";

type Official = Database["public"]["Tables"]["officials"]["Row"];

export type FeedEntry = {
  r: Ranked;
  reps: Official[];
  place?: Place;
};

/**
 * Single-column feed list with inline relevance voting and an undoable toast when dismissing an item.
 */
export function FeedList({ entries, hero }: { entries: FeedEntry[]; hero?: boolean }) {
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [toast, setToast] = useState<{ id: string; headline: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  function handleVote(itemId: string, value: boolean | null) {
    if (value === false) {
      const entry = entries.find((e) => e.r.item.id === itemId);
      const headline = entry?.r.analysis.headline?.trim() || entry?.r.item.title || "Item";
      setHiddenIds((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]));
      setToast({ id: itemId, headline });
    }
  }

  function undo() {
    if (!toast) return;
    const id = toast.id;
    start(async () => {
      const res = await setRelevance(id, null, "feed");
      if (res.ok) {
        setHiddenIds((prev) => prev.filter((x) => x !== id));
        setToast(null);
      }
    });
  }

  const visible = entries.filter((e) => !hiddenIds.includes(e.r.item.id));

  return (
    <>
      {visible.length ? (
        <ul className="space-y-3">
          {visible.map(({ r, reps, place }, i) => (
            <li key={r.item.id}>
              <ItemCard
                r={r}
                reps={reps}
                variant={hero && i === 0 ? "hero" : "default"}
                place={place}
                showVote
                onVote={handleVote}
              />
            </li>
          ))}
        </ul>
      ) : (
        <Empty>All items in this section were marked not relevant.</Empty>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm shadow-lg sm:bottom-6"
        >
          <p className="min-w-0 truncate text-muted">
            Hidden: <span className="font-medium text-ink">{toast.headline}</span>
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              disabled={pending}
              onClick={undo}
              className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {pending ? "Restoring…" : "Undo"}
            </button>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss notification"
              className="rounded-md p-1 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
