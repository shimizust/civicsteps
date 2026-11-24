import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { factKeysOf, getItem, getMyOfficials, getRegistry, getUserContext } from "@/lib/data";
import { aiConfigured } from "@/lib/ai/client";
import { assessmentHash, type Assessment } from "@/lib/ai/assess";
import { AssessPanel } from "@/components/AssessPanel";
import { FactQuestion } from "@/components/FactQuestion";
import { FACETS, topicName } from "@/lib/taxonomy";
import { matchInterests, type FeedAnalysis } from "@/lib/relevance";
import { hasDirection, personalImpact, unaffectedFacets, type PersonalImpact } from "@/lib/impact";
import { ImpactBadge, ImpactRow } from "@/components/ImpactMeter";
import { TopicTile } from "@/components/TopicTile";
import { TYPE_LABEL } from "@/components/ItemCard";
import type { ActionType } from "@/lib/gamification";
import { ActionPanel, MarkRead } from "@/components/ActionPanel";
import { OfficialCard } from "@/components/OfficialCard";
import { RelevanceVote } from "@/components/RelevanceVote";
import { ItemMap } from "@/components/ItemMap";
import { formatMiles, milesBetween } from "@/lib/locations";
import { Card, LEVEL_LABEL, LinkButton, Pill, SectionTitle, deadlineLabel } from "@/components/ui";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) redirect(`/login?next=/items/${id}`);

  const [item, mine, ctx, myActions, lastAssessment, myVote] = await Promise.all([
    getItem(supabase, id),
    getMyOfficials(supabase, user.id),
    getUserContext(supabase, user.id),
    supabase.from("user_actions").select("type").eq("user_id", user.id).eq("item_id", id),
    supabase
      .from("personal_assessments")
      .select("result, facts_hash")
      .eq("user_id", user.id)
      .eq("item_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("item_feedback").select("relevant").eq("user_id", user.id).eq("item_id", id).maybeSingle(),
  ]);
  if (!item) notFound();
  const a = item.item_analysis;
  const analysis = a as unknown as FeedAnalysis | null;
  const matches = analysis ? matchInterests({ item, analysis }, ctx.interests) : [];
  const registry = await getRegistry(supabase, factKeysOf(analysis?.impacts));
  const impact = personalImpact(analysis?.impacts, {
    groups: ctx.groups,
    matched: matches.map((m) => m.interest),
    demographics: ctx.demographics,
    answers: ctx.answers,
    registry,
  });
  const currentHash = assessmentHash({
    demographics: ctx.demographics,
    answers: ctx.answers,
    analysisVersion: `${a?.prompt_version ?? "none"}:${a?.created_at ?? ""}`,
  });
  const saved = (lastAssessment.data?.result ?? null) as Assessment | null;
  // Follow-ups answered since this assessment ran don't need asking again.
  const assessment = saved && { ...saved, follow_ups: saved.follow_ups.filter((f) => !(f.key in ctx.answers)) };
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

      <Card className="mt-6 flex flex-wrap items-center justify-between gap-3 !py-3">
        <div>
          <p className="text-sm font-medium">Is this relevant to you?</p>
          <p className="text-xs text-muted">Your answer tunes your feed, for this item and ones like it.</p>
        </div>
        <RelevanceVote itemId={item.id} current={myVote.data?.relevant ?? null} source="item" size="md" />
      </Card>

      <Where places={item.item_locations} home={ctx.profile?.lat != null && ctx.profile?.lng != null ? { lat: ctx.profile.lat, lng: ctx.profile.lng } : null} zip={ctx.profile?.zip ?? null} />

      <Scorecard impact={impact} heuristic={a?.model === "heuristic"} itemId={item.id} />
      {aiConfigured() && a && a.model !== "heuristic" && (
        <AssessPanel itemId={item.id} initial={assessment} initialHash={lastAssessment.data?.facts_hash ?? null} currentHash={currentHash} />
      )}

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

function Scorecard({ impact, heuristic, itemId }: { impact: PersonalImpact; heuristic: boolean; itemId: string }) {
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
      {impact.open.length > 0 && (
        <div className="mt-4 rounded-lg bg-paper px-3 pt-2">
          <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">Tell us more to personalize this</p>
          <div className="divide-y divide-line">
            {impact.open.slice(0, 3).map((q) => (
              <FactQuestion key={`${q.kind}:${q.key}`} q={q} source="item" itemId={itemId} />
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        {heuristic
          ? "Rough estimate from topic tags. A detailed AI estimate is on the way."
          : "AI estimate based on the item text and your profile. \"Helps\" and \"costs\" describe concrete effects on the groups named, not whether the policy is good. Check the source before deciding."}
      </p>
    </Card>
  );
}

/** The street addresses this item names, mapped against the user's ZIP. */
function Where({
  places,
  home,
  zip,
}: {
  places: { address: string; lat: number; lng: number }[];
  home: { lat: number; lng: number } | null;
  zip: string | null;
}) {
  if (!places.length) return null;
  const sorted = places
    .map((p) => ({ ...p, miles: home ? milesBetween(home, p) : null }))
    .sort((x, y) => (x.miles ?? 0) - (y.miles ?? 0));
  const closest = sorted[0].miles;
  return (
    <Card className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Where</h2>
      {closest !== null && (
        <p className="mt-2">
          {places.length > 1 ? "The nearest site is " : "This site is "}
          <strong>{formatMiles(closest)}</strong> from the middle of your ZIP code.
        </p>
      )}
      <ul className="mt-2 space-y-0.5 text-sm text-muted">
        {sorted.map((p) => (
          <li key={p.address}>
            {p.address}
            {p.miles !== null && ` (${formatMiles(p.miles)})`}
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <ItemMap places={places} home={home} zip={zip} />
      </div>
      <p className="mt-2 text-xs text-muted">
        Addresses come from the item text. We only know your ZIP code, so distances are from its middle.
      </p>
    </Card>
  );
}
