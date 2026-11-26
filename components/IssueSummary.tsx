import type { ReactNode } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { topicName } from "@/lib/taxonomy";
import type { Database } from "@/lib/supabase/database.types";
import { Card, Kicker, Pill } from "@/components/ui";

type Analysis = Pick<
  Database["public"]["Tables"]["item_analysis"]["Row"],
  "summary" | "why_it_matters" | "arguments_for" | "arguments_against" | "topics" | "model"
>;

export function IssueSummary({
  analysis,
  description,
  url,
  footer,
}: {
  analysis: Analysis | null;
  description: string | null;
  url: string | null;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <Kicker className="block">In plain English</Kicker>
      <p className="mt-2 whitespace-pre-line leading-relaxed">
        {analysis?.summary || description || "A plain-language summary is coming soon. See the source for full text."}
      </p>

      {analysis?.why_it_matters && (
        <div className="mt-4 border-l-2 border-accent pl-3.5 text-sm leading-relaxed">
          <span className="font-semibold text-ink">Why it matters: </span>
          <span className="text-muted">{analysis.why_it_matters}</span>
        </div>
      )}

      {!!(analysis?.arguments_for.length || analysis?.arguments_against.length) && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Args title="Supporters say" items={analysis.arguments_for} />
          <Args title="Opponents say" items={analysis.arguments_against} />
        </div>
      )}

      {analysis && analysis.topics.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {analysis.topics.map((t) => (
            <Pill key={t} tone="accent">{topicName(t)}</Pill>
          ))}
        </div>
      )}

      {analysis?.summary && description && description !== analysis.summary && (
        <details className="group mt-4 text-sm">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span>Source description</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <p className="mt-2 whitespace-pre-line rounded-lg bg-paper p-3 text-sm leading-relaxed text-muted">{description}</p>
        </details>
      )}

      {(analysis || url) && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{analysis && (analysis.model === "heuristic" ? "Auto-tagged. Full AI summary pending." : "AI-generated summary.")}</span>
          {url && (
            <a
              className="inline-flex items-center gap-1 text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              Read the source <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </p>
      )}

      {footer && <div className="mt-4 border-t border-line pt-3.5">{footer}</div>}
    </Card>
  );
}

function Args({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-lg border border-line/70 bg-paper p-3.5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">{title}</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-snug text-muted">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
