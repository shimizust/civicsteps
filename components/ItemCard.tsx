import Link from "next/link";
import type { Ranked } from "@/lib/relevance";
import { Card, LEVEL_LABEL, Pill, deadlineLabel } from "@/components/ui";

const TYPE_LABEL: Record<string, string> = {
  bill: "Bill",
  comment_period: "Public comment",
  hearing: "Hearing",
  vote: "Vote",
  agenda_item: "Council agenda",
  opportunity: "Opportunity",
};

export function ItemCard({ r }: { r: Ranked }) {
  const { item, analysis } = r;
  const urgent = r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= 7;
  const label = deadlineLabel(r.daysLeft, item.comment_deadline ? "comment" : "event");
  const summary = analysis.summary && !item.title.includes(analysis.summary.slice(0, 60)) ? analysis.summary : null;
  return (
    <Link href={`/items/${item.id}`} className="block group">
      <Card className="transition group-hover:border-accent">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Pill>{LEVEL_LABEL[item.level]}</Pill>
          <Pill>{TYPE_LABEL[item.type] ?? item.type}</Pill>
          {r.petMatch && <Pill tone="pet">★ Pet issue</Pill>}
          {label && r.daysLeft !== null && r.daysLeft >= 0 && <Pill tone={urgent ? "urgent" : "accent"}>{label}</Pill>}
        </div>
        <h3 className="mt-2 font-semibold leading-snug group-hover:text-accent">{item.title}</h3>
        {summary && <p className="mt-1.5 line-clamp-3 text-sm text-muted">{summary}</p>}
        {r.reasons.length > 0 && <p className="mt-2 text-xs text-muted">Why you&apos;re seeing this: {r.reasons.slice(0, 3).join(" · ")}</p>}
      </Card>
    </Link>
  );
}
