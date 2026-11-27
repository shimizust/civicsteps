"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Bookmark, ChevronRight, Clock, MapPin, PenLine, RotateCcw, X } from "lucide-react";
import { setFavorite } from "@/app/actions";
import type { FavoritedEntry } from "@/lib/data";
import type { ActionType } from "@/lib/gamification";
import { hasDirection } from "@/lib/impact";
import { formatMiles } from "@/lib/locations";
import { typeLabel } from "@/components/ItemCard";
import { TopicTile } from "@/components/TopicTile";
import { ImpactBadge, ImpactChip } from "@/components/ImpactMeter";
import { RepAvatars } from "@/components/RepAvatars";
import { FavoriteButton } from "@/components/FavoriteButton";
import { Card, Empty, Kicker, LEVEL_LABEL, Pill, SectionTitle, cx, deadlineLabel } from "@/components/ui";

const ACTION_VERB: Partial<Record<ActionType, string>> = {
  emailed: "Emailed",
  called: "Called",
  commented: "Commented",
  signed: "Signed",
  attended: "Attended",
  shared: "Shared",
};

/**
 * Interactive Favorites list with status/action tracking and undoable unfavoriting.
 */
export function FavoritesList({
  attention,
  rest,
}: {
  attention: FavoritedEntry[];
  rest: FavoritedEntry[];
}) {
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [toast, setToast] = useState<{ id: string; headline: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  function handleRemove(itemId: string, headline: string) {
    setRemovedIds((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]));
    setToast({ id: itemId, headline });
  }

  function undo() {
    if (!toast) return;
    const id = toast.id;
    start(async () => {
      const res = await setFavorite(id, true, "favorites");
      if (res.ok) {
        setRemovedIds((prev) => prev.filter((x) => x !== id));
        setToast(null);
      }
    });
  }

  const visibleAttention = attention.filter((e) => !removedIds.includes(e.item.id));
  const visibleRest = rest.filter((e) => !removedIds.includes(e.item.id));

  return (
    <>
      {!visibleAttention.length && !visibleRest.length ? (
        <Empty>
          No favorited issues left in this view.{" "}
          <Link className="text-accent underline" href="/browse">
            Browse all items
          </Link>
        </Empty>
      ) : (
        <>
          {visibleAttention.length > 0 && (
            <>
              <SectionTitle hint="Updated since you last checked, or deadline within 2 weeks">
                Needs your attention
              </SectionTitle>
              <ul className="space-y-3">
                {visibleAttention.map((entry) => (
                  <li key={entry.item.id}>
                    <FavoriteCard entry={entry} onRemoved={handleRemove} />
                  </li>
                ))}
              </ul>
            </>
          )}

          {visibleRest.length > 0 && (
            <>
              <SectionTitle hint={`${visibleRest.length} ${visibleRest.length === 1 ? "issue" : "issues"}`}>
                Following up
              </SectionTitle>
              <ul className="space-y-3">
                {visibleRest.map((entry) => (
                  <li key={entry.item.id}>
                    <FavoriteCard entry={entry} onRemoved={handleRemove} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm shadow-lg sm:bottom-6"
        >
          <p className="min-w-0 truncate text-muted">
            Removed from favorites: <span className="font-medium text-ink">{toast.headline}</span>
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

function FavoriteCard({
  entry,
  onRemoved,
}: {
  entry: FavoritedEntry;
  onRemoved: (itemId: string, headline: string) => void;
}) {
  const { item, analysis, impact } = entry;
  const headline = analysis.headline?.trim() || item.title;
  const showTitle = headline !== item.title;
  const summary = analysis.summary && !item.title.includes(analysis.summary.slice(0, 60)) ? analysis.summary : null;
  const open = entry.daysLeft !== null && entry.daysLeft >= 0;
  const urgent = open && entry.daysLeft! <= 7;
  const label = open ? deadlineLabel(entry.daysLeft, item.comment_deadline ? "comment" : "event") : null;
  const closedComment = entry.daysLeft !== null && entry.daysLeft < 0 && item.type === "comment_period";
  const facets = impact.facets.filter((f) => f.magnitude > 0).slice(0, 3);
  const showDir = hasDirection(impact);
  const draftHref = `/draft/${item.id}${item.type === "comment_period" ? "?kind=public_comment" : ""}`;
  const draftLabel = item.type === "comment_period" ? "Draft comment" : entry.actions.length > 0 ? "Follow up" : "Speak up";
  const statusLine = [
    item.status,
    item.last_action && item.last_action !== item.status ? item.last_action : null,
    item.last_action_at ? new Date(item.last_action_at).toLocaleDateString() : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card
      className={cx(
        "group relative flex gap-3.5 transition duration-150 hover:-translate-y-0.5 hover:border-accent hover:shadow-[var(--shadow-card-hover)] sm:gap-4",
        entry.update.changed ? "border-favorite" : "border-favorite/45",
      )}
    >
      <TopicTile topics={analysis.topics} pet={entry.petMatch} size="md" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <Kicker className="tabular-nums">
            {LEVEL_LABEL[item.level]} · {typeLabel(item)}
          </Kicker>
          <Pill tone="favorite">
            <Bookmark className="h-3 w-3 fill-current" aria-hidden /> Favorited
          </Pill>
          {entry.update.changed && <Pill tone="accent">Updated</Pill>}
          {label && (
            <Pill tone={urgent ? "urgent" : "accent"} className="tabular-nums">
              <Clock className="h-3 w-3" aria-hidden />
              {label}
            </Pill>
          )}
          {closedComment && <Pill tone="neutral">Comment period closed</Pill>}
          {entry.place && (
            <span title={`${entry.place.address}, measured from the middle of your ZIP`}>
              <Pill tone="neutral" className="tabular-nums">
                <MapPin className="h-3 w-3" aria-hidden />
                {formatMiles(entry.place.miles)} from you
              </Pill>
            </span>
          )}
        </div>

        <h3
          className="mt-2 line-clamp-3 font-display text-lg font-semibold leading-snug tracking-tight"
          title={showTitle ? undefined : item.title}
        >
          <Link
            href={`/items/${item.id}`}
            className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent group-hover:text-accent"
          >
            {headline}
          </Link>
        </h3>
        {showTitle && (
          <p className="mt-0.5 truncate text-xs text-muted" title={item.title}>
            {item.title}
          </p>
        )}
        {summary && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{summary}</p>}

        {entry.update.changed && entry.update.summary && (
          <p className="mt-2.5 rounded-lg bg-favorite-soft/80 px-3 py-2 text-xs font-medium text-favorite">
            Updated since you last checked: {entry.update.summary}
          </p>
        )}

        {(facets.length > 0 || impact.level) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {facets.map((f) => (
              <ImpactChip key={f.facet} f={f} showDirection={showDir} />
            ))}
            <span className="ml-auto pl-2">
              <ImpactBadge impact={impact} />
            </span>
          </div>
        )}

        <div className="mt-3 space-y-1 text-xs text-muted">
          {statusLine && (
            <p className="leading-relaxed">
              <span className="font-medium text-ink">Current status:</span> {statusLine}
            </p>
          )}
          <p className="leading-relaxed">
            <span className="font-medium text-ink">Your actions:</span>{" "}
            {entry.actions.length
              ? entry.actions
                  .slice(0, 4)
                  .map((a) => `${ACTION_VERB[a.type] ?? a.type} (${new Date(a.created_at).toLocaleDateString()})`)
                  .join(", ")
              : "No action logged yet"}
          </p>
        </div>

        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3">
            <RepAvatars officials={entry.reps} />
            <div className="relative z-10 ml-auto flex flex-wrap items-center gap-2">
              <FavoriteButton
                itemId={item.id}
                favorited={true}
                source="favorites"
                size="sm"
                onChange={(v) => {
                  if (!v) onRemoved(item.id, headline);
                }}
              />
              {!closedComment && (
                <Link
                  href={draftHref}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:text-paper"
                >
                  <PenLine className="h-3.5 w-3.5" aria-hidden />
                  {draftLabel}
                </Link>
              )}
              <span className="pointer-events-none inline-flex shrink-0 items-center text-sm font-medium text-accent" aria-hidden>
                Details
                <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
