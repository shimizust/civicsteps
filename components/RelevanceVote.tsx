"use client";
import { useEffect, useState, useTransition } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { setRelevance } from "@/app/actions";
import { cx } from "@/components/ui";

/**
 * "Relevant / Not relevant" toggle for one item. Tapping the selected choice again clears it.
 * Saving revalidates the feed, so a "not relevant" item drops out of it on the next render.
 */
export function RelevanceVote({
  itemId,
  current,
  source,
  size = "sm",
  compact = false,
  onVote,
}: {
  itemId: string;
  current: boolean | null;
  source: "feed" | "browse" | "item";
  size?: "sm" | "md";
  compact?: boolean;
  onVote?: (value: boolean | null) => void;
}) {
  const [vote, setVote] = useState(current);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    setVote(current);
  }, [current]);

  const save = (next: boolean) => {
    const value = vote === next ? null : next;
    const prev = vote;
    setVote(value);
    setError(false);
    start(async () => {
      const res = await setRelevance(itemId, value, source);
      if (!res.ok) {
        setVote(prev);
        setError(true);
      } else {
        onVote?.(value);
      }
    });
  };

  const btn = (on: boolean, tone: "yes" | "no") =>
    cx(
      "inline-flex items-center justify-center gap-1.5 rounded-full border transition disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      compact ? "h-8 w-8" : size === "md" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs",
      on
        ? tone === "yes"
          ? "border-accent bg-accent-soft text-accent"
          : "border-cost/40 bg-cost-soft text-cost"
        : "border-line bg-card text-muted hover:border-accent hover:text-ink",
    );
  const icon = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-busy={pending}>
      <button
        type="button"
        aria-pressed={vote === true}
        aria-label="Relevant to me"
        title="Relevant to me"
        disabled={pending}
        onClick={() => save(true)}
        className={btn(vote === true, "yes")}
      >
        <ThumbsUp className={icon} aria-hidden />
        {!compact && <span>Relevant</span>}
      </button>
      <button
        type="button"
        aria-pressed={vote === false}
        aria-label="Not relevant to me"
        title="Not relevant to me"
        disabled={pending}
        onClick={() => save(false)}
        className={btn(vote === false, "no")}
      >
        <ThumbsDown className={icon} aria-hidden />
        {!compact && <span>Not relevant</span>}
      </button>
      {error && <span className="text-xs text-cost">Couldn&apos;t save. Try again.</span>}
    </div>
  );
}
