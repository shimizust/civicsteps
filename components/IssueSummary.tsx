import { topicName } from "@/lib/taxonomy";
import type { Database } from "@/lib/supabase/database.types";
import { Card, Pill } from "@/components/ui";

type Analysis = Pick<
  Database["public"]["Tables"]["item_analysis"]["Row"],
  "summary" | "why_it_matters" | "arguments_for" | "arguments_against" | "topics" | "model"
>;

export function IssueSummary({
  analysis,
  description,
  url,
}: {
  analysis: Analysis | null;
  description: string | null;
  url: string | null;
}) {
  return (
    <Card>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">In plain English</h2>
      <p className="mt-2 whitespace-pre-line leading-relaxed">{analysis?.summary || description || "A plain-language summary is coming soon. See the source for full text."}</p>
      {analysis?.why_it_matters && <p className="mt-3 text-sm"><strong>Why it matters</strong> {analysis.why_it_matters}</p>}
      {!!(analysis?.arguments_for.length || analysis?.arguments_against.length) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Args title="Supporters say" items={analysis.arguments_for} />
          <Args title="Opponents say" items={analysis.arguments_against} />
        </div>
      )}
      {analysis && analysis.topics.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">{analysis.topics.map((t) => <Pill key={t} tone="accent">{topicName(t)}</Pill>)}</div>
      )}
      {analysis?.summary && description && description !== analysis.summary && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-accent">Source description</summary>
          <p className="mt-2 whitespace-pre-line">{description}</p>
        </details>
      )}
      {(analysis || url) && (
        <p className="mt-4 text-xs text-muted">
          {analysis && (analysis.model === "heuristic" ? "Auto-tagged. Full AI summary pending." : "AI-generated summary.")}{" "}
          {url && <a className="text-accent underline" href={url} target="_blank" rel="noreferrer">Read the source for full details</a>}
        </p>
      )}
    </Card>
  );
}

function Args({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}
