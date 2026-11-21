import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getItem, getMyOfficials, getUserContext } from "@/lib/data";
import { FACETS, topicName } from "@/lib/taxonomy";
import { matchInterests, type FeedAnalysis } from "@/lib/relevance";
import { hasDirection, personalImpact, unaffectedFacets, type PersonalImpact } from "@/lib/impact";
import { ImpactBadge, ImpactRow } from "@/components/ImpactMeter";
import { TopicTile } from "@/components/TopicTile";
import { TYPE_LABEL } from "@/components/ItemCard";
import type { ActionType } from "@/lib/gamification";
import { ActionPanel, MarkRead } from "@/components/ActionPanel";
import { OfficialCard } from "@/components/OfficialCard";
import { Card, LEVEL_LABEL, LinkButton, Pill, SectionTitle, deadlineLabel } from "@/components/ui";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) redirect(`/login?next=/items/${id}`);

  const [item, mine, ctx, myActions] = await Promise.all([
    getItem(supabase, id),
    getMyOfficials(supabase, user.id),
    getUserContext(supabase, user.id),
    supabase.from("user_actions").select("type").eq("user_id", user.id).eq("item_id", id),
  ]);
  if (!item) notFound();
  const a = item.item_analysis;
  const analysis = a as unknown as FeedAnalysis | null;
  const matches = analysis ? matchInterests({ item, analysis }, ctx.interests) : [];
  const impact = personalImpact(analysis?.impacts, { groups: ctx.groups, matched: matches.map((m) => m.interest) });
  const isPet = matches.some((m) => m.interest.is_pet);
  const headline = a?.headline?.trim() || null;

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
      <div className="mt-4 flex items-start gap-4">
        <TopicTile topics={a?.topics ?? []} pet={isPet} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <Pill>{LEVEL_LABEL[item.level]}</Pill>
            <Pill>{TYPE_LABEL[item.type] ?? item.type}</Pill>
            {item.agency && <Pill>{item.agency}</Pill>}
            {daysLeft !== null && daysLeft >= 0 && <Pill tone={daysLeft <= 7 ? "urgent" : "accent"}>{deadlineLabel(daysLeft, isComment ? "comment" : "event")}</Pill>}
            {daysLeft !== null && daysLeft < 0 && isComment && <Pill tone="urgent">Comment period closed</Pill>}
          </div>
          <h1 className="mt-3 font-display text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{headline ?? item.title}</h1>
          {headline && <p className="mt-1.5 text-sm text-muted">{item.title}</p>}
          {item.status && <p className="mt-2 text-sm text-muted">Status: {item.status}{item.last_action_at && ` (${new Date(item.last_action_at).toLocaleDateString()})`}</p>}
        </div>
      </div>

      <Scorecard impact={impact} heuristic={a?.model === "heuristic"} />

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
          <Link className="text-accent underline" href="/onboarding?step=1">Check your address</Link>
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

function Scorecard({ impact, heuristic }: { impact: PersonalImpact; heuristic: boolean }) {
  if (!impact.facets.length) return null;
  const showDir = hasDirection(impact);
  const rest = unaffectedFacets(impact);
  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">How this affects you</h2>
        <ImpactBadge impact={impact} size="lg" />
      </div>
      <ul className="mt-2 divide-y divide-line">
        {impact.facets.map((f) => <ImpactRow key={f.facet} f={f} showDirection={showDir} />)}
      </ul>
      {rest.length > 0 && (
        <p className="mt-2 text-xs text-muted">Little or no direct effect on: {rest.map((f) => FACETS[f].label).join(", ")}.</p>
      )}
      <p className="mt-3 text-xs text-muted">
        {heuristic
          ? "Rough estimate from topic tags. A detailed AI estimate is on the way."
          : "AI estimate based on the item text and your profile. \"Helps\" and \"costs\" describe concrete effects on the groups named, not whether the policy is good. Check the source before deciding."}
      </p>
    </Card>
  );
}
