"use client";
import { useState, useTransition } from "react";
import { answerFact, clearFact, type AnswerInput } from "@/app/actions";
import type { OpenQuestion } from "@/lib/facts";
import { cx } from "@/components/ui";

/** One tap-to-answer question. Saving revalidates the page, so the estimate it feeds updates in place. */
export function FactQuestion({
  q,
  source,
  itemId,
  current,
  hint,
}: {
  q: Pick<OpenQuestion, "kind" | "key" | "question" | "helpText" | "options">;
  source: AnswerInput["source"];
  itemId?: string | null;
  /** Pre-selected answer (Profile page). */
  current?: string | null;
  hint?: string;
}) {
  const [picked, setPicked] = useState<string | null | undefined>(current);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  const save = (value: string | null) => {
    setPicked(value);
    setError(false);
    start(async () => {
      const res = await answerFact({ kind: q.kind, key: q.key, value, source, itemId });
      if (!res.ok) setError(true);
    });
  };

  return (
    <div className={cx("py-3", pending && "opacity-60")} aria-busy={pending}>
      <p className="text-sm font-medium">{q.question}</p>
      {q.helpText && <p className="mt-1 text-sm text-muted">{q.helpText}</p>}
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {q.options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={picked === o.value}
            disabled={pending}
            onClick={() => save(o.value)}
            className={cx(
              "rounded-full border px-3 py-1 text-sm transition",
              picked === o.value ? "border-accent bg-accent-soft text-accent" : "border-line bg-card hover:border-accent",
            )}
          >
            {o.label}
          </button>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={() => save(null)}
          aria-pressed={picked === null}
          className={cx("px-1 text-xs underline-offset-2 hover:underline", picked === null ? "text-ink" : "text-muted")}
        >
          Prefer not to say
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-urgent">Couldn&apos;t save that. Try again.</p>}
    </div>
  );
}

/** Deletes a saved answer so it can be asked again. */
export function ForgetAnswer({ factKey }: { factKey: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => clearFact(factKey))} className="text-xs text-muted underline-offset-2 hover:text-accent hover:underline">
      {pending ? "Forgetting…" : "Forget"}
    </button>
  );
}
