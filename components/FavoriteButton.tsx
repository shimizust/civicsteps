"use client";
import { useEffect, useState, useTransition } from "react";
import { Bookmark } from "lucide-react";
import { markFavoriteSeen, setFavorite } from "@/app/actions";
import { cx } from "@/components/ui";

/**
 * Toggle to favorite an issue to continue following up on (distinct from "Relevant" feed tuning).
 */
export function FavoriteButton({
  itemId,
  favorited,
  source,
  size = "sm",
  compact = false,
  onChange,
}: {
  itemId: string;
  favorited: boolean;
  source: "feed" | "browse" | "item" | "favorites";
  size?: "sm" | "md";
  compact?: boolean;
  onChange?: (favorited: boolean) => void;
}) {
  const [on, setOn] = useState(favorited);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    setOn(favorited);
  }, [favorited]);

  const toggle = () => {
    const next = !on;
    const prev = on;
    setOn(next);
    setError(false);
    start(async () => {
      const res = await setFavorite(itemId, next, source);
      if (!res.ok) {
        setOn(prev);
        setError(true);
      } else {
        onChange?.(next);
      }
    });
  };

  const icon = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5" aria-busy={pending}>
      <button
        type="button"
        aria-pressed={on}
        aria-label={on ? "Remove from favorites" : "Favorite to follow up"}
        title={on ? "Favorited — click to remove" : "Favorite to keep following up"}
        disabled={pending}
        onClick={toggle}
        className={cx(
          "inline-flex items-center justify-center gap-1.5 rounded-full border transition disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          compact ? "h-8 w-8" : size === "md" ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-1 text-xs",
          on
            ? "border-favorite/50 bg-favorite-soft font-medium text-favorite"
            : "border-line bg-card text-muted hover:border-favorite hover:text-favorite",
        )}
      >
        <Bookmark className={cx(icon, on && "fill-current")} aria-hidden />
        {!compact && <span>{on ? "Favorited" : "Favorite"}</span>}
      </button>
      {error && <span className="text-xs text-cost">Couldn&apos;t save. Try again.</span>}
    </div>
  );
}

/** Updates last-seen progress when a user visits an updated favorited item. */
export function MarkFavoriteSeen({ itemId }: { itemId: string }) {
  useEffect(() => {
    markFavoriteSeen(itemId).catch(() => {});
  }, [itemId]);
  return null;
}
