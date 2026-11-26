"use client";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Sparkles } from "lucide-react";
import type { Assessment, Verdict } from "@/lib/ai/assess";
import type { AssessResponse } from "@/app/api/assess/route";
import { FACETS } from "@/lib/taxonomy";
import { Button, Card, Kicker, cx } from "@/components/ui";
import { FactQuestion } from "@/components/FactQuestion";

const VERDICT: Record<Verdict, { label: string; tone: string }> = {
  benefit: { label: "Likely helps you", tone: "bg-benefit-soft text-benefit" },
  cost: { label: "Likely costs you", tone: "bg-cost-soft text-cost" },
  mixed: { label: "Mixed for you", tone: "bg-accent-soft text-accent" },
  neutral: { label: "Barely affects you", tone: "bg-paper text-muted border border-line" },
  unclear: { label: "Depends on details", tone: "bg-paper text-muted border border-line" },
};

const DIR = {
  benefit: { Icon: ArrowUp, tone: "text-benefit", label: "helps" },
  cost: { Icon: ArrowDown, tone: "text-cost", label: "costs" },
  mixed: { Icon: ArrowUpDown, tone: "text-muted", label: "mixed" },
};

/**
 * On-demand personal assessment. `initial` is the latest cached one, made from the answers hashed as `initialHash`.
 * When `embedded` is true, renders cleanly as an inline extension inside the unified "How this affects you" card.
 */
export function AssessPanel({
  itemId,
  initial,
  initialHash,
  currentHash,
  embedded = false,
  excludeFactKeys = [],
}: {
  itemId: string;
  initial: Assessment | null;
  initialHash: string | null;
  currentHash: string;
  embedded?: boolean;
  excludeFactKeys?: string[];
}) {
  const [result, setResult] = useState<Assessment | null>(initial);
  const [resultHash, setResultHash] = useState<string | null>(initialHash);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      setError(null);
      const res = await fetch("/api/assess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId }) });
      const body = (await res.json().catch(() => ({ error: "Something went wrong." }))) as AssessResponse;
      if ("error" in body) setError(body.error);
      else {
        setResult(body.assessment);
        setResultHash(body.hash);
      }
    });

  const showStale = !!result && resultHash !== currentHash;
  const followUps = result ? result.follow_ups.filter((q) => !excludeFactKeys.includes(q.key)) : [];

  const inner = (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Kicker className="inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
          {embedded ? "Deeper look at your situation" : "Your situation"}
        </Kicker>
        {result && (
          <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium", VERDICT[result.overall].tone)}>
            {VERDICT[result.overall].label}
          </span>
        )}
      </div>

      {!result && (
        <p className="mt-2 text-sm text-muted">
          Want a closer look? We&apos;ll ask Claude how this would affect you using your answers so far, and suggest questions that would sharpen it.
        </p>
      )}

      {result && (
        <div className={cx(pending && "opacity-60")}>
          <p className="mt-2 text-sm leading-relaxed">{result.summary}</p>
          {result.points.length > 0 && (
            <ul className="mt-3 space-y-2">
              {result.points.map((p, i) => {
                const d = DIR[p.direction];
                return (
                  <li key={i} className="flex gap-2 text-sm">
                    <d.Icon className={cx("mt-0.5 h-4 w-4 shrink-0", d.tone)} aria-label={d.label} />
                    <span>
                      <span className="font-medium">{FACETS[p.facet as keyof typeof FACETS]?.label ?? p.facet}:</span> {p.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {followUps.length > 0 && (
            <div className="mt-4 rounded-lg bg-paper px-3.5 pt-2.5">
              <Kicker className="block pt-0.5">This would be clearer if we knew</Kicker>
              <div className="divide-y divide-line">
                {followUps.map((q) => (
                  <FactQuestion key={q.key} q={{ ...q, kind: "fact" }} source="agent" itemId={itemId} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-cost">{error}</p>}

      {(!result || showStale) && (
        <div className="mt-3.5 flex flex-wrap items-center gap-3">
          <Button type="button" variant={result || embedded ? "secondary" : "primary"} onClick={run} disabled={pending}>
            {pending ? "Thinking…" : result ? "Update with my new answers" : "Ask about my situation"}
          </Button>
          <span className="text-xs text-muted">Sends your profile answers and city (never your ZIP code or name) to Claude.</span>
        </div>
      )}
      {!embedded && result && !showStale && (
        <p className="mt-3 text-xs text-muted">AI estimate from the item text and your answers. It can be wrong; check the source before deciding.</p>
      )}
    </div>
  );

  if (embedded) {
    return <div className="mt-5 border-t border-line pt-4">{inner}</div>;
  }
  return <Card>{inner}</Card>;
}
