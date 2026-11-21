import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getItem, getMyOfficials } from "@/lib/data";
import { topicName } from "@/lib/taxonomy";
import type { ActionType } from "@/lib/gamification";
import { ActionPanel, MarkRead } from "@/components/ActionPanel";
import { OfficialCard } from "@/components/OfficialCard";
import { Card, LEVEL_LABEL, LinkButton, Pill, SectionTitle, deadlineLabel } from "@/components/ui";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) redirect(`/login?next=/items/${id}`);

  const [item, mine, myActions] = await Promise.all([
    getItem(supabase, id),
    getMyOfficials(supabase, user.id),
    supabase.from("user_actions").select("type").eq("user_id", user.id).eq("item_id", id),
  ]);
  if (!item) notFound();
  const a = item.item_analysis;

  const deadline = item.comment_deadline ?? item.event_at;
  const daysLeft = deadline ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000) : null;
  const isComment = item.type === "comment_period";

  // Who decides: your officials at this item's level, involved ones first.
  const involved = new Map(item.item_officials.map((io) => [io.officials?.id, io.role]));
  const deciders = isComment
    ? []
    : mine
        .filter((o) => (item.level === "city" || item.level === "county" ? o.level === "city" || o.level === "county" : o.level === item.level))
        .sort((x, y) => Number(involved.has(y.id)) - Number(involved.has(x.id)));
  const otherSponsors = item.item_officials.filter((io) => io.officials && !mine.some((m) => m.id === io.officials!.id));

  const actions: ActionType[] = isComment ? ["commented", "shared"] : item.type === "agenda_item" || item.type === "hearing" ? ["emailed", "called", "attended", "shared"] : ["emailed", "called", "shared"];

  return (
    <article>
      <MarkRead itemId={item.id} />
      <Link href="/feed" className="text-sm text-muted hover:text-accent">← Back to feed</Link>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Pill>{LEVEL_LABEL[item.level]}</Pill>
        {item.agency && <Pill>{item.agency}</Pill>}
        {daysLeft !== null && daysLeft >= 0 && <Pill tone={daysLeft <= 7 ? "urgent" : "accent"}>{deadlineLabel(daysLeft, isComment ? "comment" : "event")}</Pill>}
        {daysLeft !== null && daysLeft < 0 && isComment && <Pill tone="urgent">Comment period closed</Pill>}
      </div>
      <h1 className="mt-3 font-display text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{item.title}</h1>
      {item.status && <p className="mt-2 text-sm text-muted">Status: {item.status}{item.last_action_at && ` (${new Date(item.last_action_at).toLocaleDateString()})`}</p>}

      <Card className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">In plain English</h2>
        <p className="mt-2 leading-relaxed">{a?.summary || (item.description ?? "A plain-language summary is coming soon. See the source for full text.")}</p>
        {a?.why_it_matters && <p className="mt-3 text-sm"><strong>Why it matters:</strong> {a.why_it_matters}</p>}
        {(a?.arguments_for.length || a?.arguments_against.length) ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Args title="Supporters say" items={a.arguments_for} />
            <Args title="Opponents say" items={a.arguments_against} />
          </div>
        ) : null}
        {a && a.topics.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">{a.topics.map((t) => <Pill key={t} tone="accent">{topicName(t)}</Pill>)}</div>
        )}
        <p className="mt-4 text-xs text-muted">
          {a?.model === "heuristic" ? "Auto-tagged; full AI summary pending." : "AI-generated summary."}{" "}
          {item.url && <a className="text-accent underline" href={item.url} target="_blank" rel="noreferrer">Read the source</a>}
        </p>
      </Card>

      <SectionTitle>Make your voice heard</SectionTitle>
      {isComment ? (
        <Card>
          <p>Anyone can submit a public comment. Agencies must read and consider every comment, and specific, personal comments carry the most weight.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <LinkButton href={`/draft/${item.id}?kind=public_comment`}>✍️ Draft my comment</LinkButton>
            {item.action_url && <LinkButton variant="secondary" href={item.action_url} target="_blank" rel="noreferrer">Open comment form ↗</LinkButton>}
          </div>
        </Card>
      ) : deciders.length ? (
        <ul className="space-y-3">
          {deciders.map((o) => (
            <li key={o.id}>
              <OfficialCard o={o} role={involved.get(o.id)} draftHref={`/draft/${item.id}?official=${encodeURIComponent(o.id)}`} />
            </li>
          ))}
        </ul>
      ) : (
        <Card className="text-sm text-muted">
          We don&apos;t have your {LEVEL_LABEL[item.level].toLowerCase()} representatives yet.{" "}
          <Link className="text-accent underline" href="/onboarding?step=1">Check your ZIP code</Link>
          {item.action_url && <> or <a className="text-accent underline" href={item.action_url} target="_blank" rel="noreferrer">see the official page</a></>}.
        </Card>
      )}

      {otherSponsors.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          Sponsored by {otherSponsors.map((io) => io.officials!.name).slice(0, 5).join(", ")}
          {otherSponsors.length > 5 && ` and ${otherSponsors.length - 5} others`}.
        </p>
      )}

      <Card className="mt-6">
        <ActionPanel itemId={item.id} actions={actions} done={(myActions.data ?? []).map((x) => x.type)} />
      </Card>
    </article>
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
