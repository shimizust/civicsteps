import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Bookmark, Clock, ExternalLink, MapPin, PenLine } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { factKeysOf, getItem, getMyOfficials, getRegistry, getUserContext } from "@/lib/data";
import { favoriteUpdate } from "@/lib/favorites";
import { aiConfigured } from "@/lib/ai/client";
import { assessmentHash, type Assessment } from "@/lib/ai/assess";
import { AssessPanel } from "@/components/AssessPanel";
import { BackLink } from "@/components/BackLink";
import { FactQuestion } from "@/components/FactQuestion";
import { FACETS } from "@/lib/taxonomy";
import { matchInterests, type FeedAnalysis } from "@/lib/relevance";
import { hasDirection, personalImpact, unaffectedFacets, type PersonalImpact } from "@/lib/impact";
import { ImpactBadge, ImpactRow } from "@/components/ImpactMeter";
import { TopicTile } from "@/components/TopicTile";
import { typeLabel } from "@/components/ItemCard";
import type { ActionType } from "@/lib/gamification";
import { ActionPanel, MarkRead } from "@/components/ActionPanel";
import { OfficialCard } from "@/components/OfficialCard";
import { RelevanceVote } from "@/components/RelevanceVote";
import { FavoriteButton, MarkFavoriteSeen } from "@/components/FavoriteButton";
import { alertsForItem, organizationsForTopic, reviewDate, stateLabel } from "@/lib/advocacy";
import { getCampaignData } from "@/lib/campaignData";
import { topicName } from "@/lib/taxonomy";
import { campaignsForItem } from "@/lib/campaigns";
import { CampaignIssueCard } from "@/components/CampaignIssueCard";
import { IssueSummary } from "@/components/IssueSummary";
import { ItemMap } from "@/components/ItemMap";
import { formatMiles, milesBetween } from "@/lib/locations";
import { placeName } from "@/lib/place";
import { Card, SectionTitle, Kicker, LEVEL_LABEL, LinkButton, Pill, deadlineLabel } from "@/components/ui";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!user) redirect(`/login?next=/items/${id}`);

  const [item, mine, ctx, myActions, myVote, myFavorite, { snapshot }] = await Promise.all([
    getItem(supabase, id),
    getMyOfficials(supabase, user.id),
    getUserContext(supabase, user.id),
    supabase.from("user_actions").select("type").eq("user_id", user.id).eq("item_id", id),
    supabase.from("item_feedback").select("relevant").eq("user_id", user.id).eq("item_id", id).maybeSingle(),
    supabase
      .from("item_favorites")
      .select(
        "item_id, created_at, last_seen_at, last_seen_status, last_seen_action, last_seen_action_at, last_seen_enacted_at, last_seen_deadline",
      )
      .eq("user_id", user.id)
      .eq("item_id", id)
      .maybeSingle(),
    getCampaignData(supabase),
  ]);
  if (!item) notFound();
  const favorite = myFavorite.data;
  const favUpdate = favorite ? favoriteUpdate(item, favorite) : null;
  const a = item.item_analysis;
  const campaigns = campaignsForItem(item.source, item.external_id, a?.topics ?? []);
  const topicGroups = new Set((a?.topics ?? []).flatMap(organizationsForTopic));
  const directUrls = new Set(campaigns.direct.flatMap((issue) => issue.campaigns.map((c) => c.url)));
  const alerts = alertsForItem(snapshot, {
    url: item.url,
    action_url: item.action_url,
    title: item.title,
    source: item.source,
    external_id: item.external_id,
    state: item.state,
  }).filter((alert) => !directUrls.has(alert.url));
  const checked = snapshot.filter((source) => source.checked === source.attempted);
  const latest = checked.map((s) => s.attempted).sort().at(-1);
  const analysis = a as unknown as FeedAnalysis | null;
  const matches = analysis ? matchInterests({ item, analysis }, ctx.interests) : [];
  const place = placeName(ctx.profile?.jurisdiction_ids ?? [], ctx.profile?.state ?? null);
  const assessments = supabase
    .from("personal_assessments")
    .select("result, facts_hash")
    .eq("user_id", user.id)
    .eq("item_id", id);
  const [registry, lastAssessment] = await Promise.all([
    getRegistry(supabase, factKeysOf(analysis?.impacts)),
    (place ? assessments.eq("place", place) : assessments.is("place", null))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
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
    place,
  });
  const saved = (lastAssessment.data?.result ?? null) as Assessment | null;
  const assessment = saved && { ...saved, follow_ups: saved.follow_ups.filter((f) => !(f.key in ctx.answers)) };
  const isPet = matches.some((m) => m.interest.is_pet);
  const headline = a?.headline?.trim() || null;

  const deadline = item.comment_deadline ?? item.event_at;
  const daysLeft = deadline ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000) : null;
  const isComment = item.type === "comment_period";

  const involved = new Map(item.item_officials.map((io) => [io.officials?.id, io.role]));
  const deciders = isComment
    ? []
    : mine
        .filter((o) => (item.level === "city" || item.level === "county" ? o.level === "city" || o.level === "county" : o.level === item.level))
        .sort((x, y) => Number(involved.has(y.id)) - Number(involved.has(x.id)));
  const otherSponsors = item.item_officials.filter((io) => io.officials && !mine.some((m) => m.id === io.officials!.id));

  const actions: ActionType[] = isComment
    ? ["commented", "shared"]
    : item.type === "agenda_item" || item.type === "hearing"
      ? ["emailed", "called", "attended", "shared"]
      : ["emailed", "called", "shared"];

  const showAssess = aiConfigured() && !!a && a.model !== "heuristic";
  const showImpactCard = impact.facets.length > 0 || showAssess;
  const scorecardQuestionKeys = impact.open.slice(0, 3).map((q) => q.key);

  return (
    <article>
      <MarkRead itemId={item.id} />
      {favorite && favUpdate?.changed && <MarkFavoriteSeen itemId={item.id} />}
      <BackLink fallbackHref="/feed" fallbackLabel="Back to feed" />

      <header className="mt-4 flex items-start gap-4">
        <TopicTile topics={a?.topics ?? []} pet={isPet} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <Kicker>
                {LEVEL_LABEL[item.level]} · {typeLabel(item)}
                {item.agency ? ` · ${item.agency}` : ""}
              </Kicker>
              {daysLeft !== null && daysLeft >= 0 && (
                <Pill tone={daysLeft <= 7 ? "urgent" : "accent"} className="tabular-nums">
                  <Clock className="h-3 w-3" aria-hidden />
                  {deadlineLabel(daysLeft, isComment ? "comment" : "event")}
                </Pill>
              )}
              {daysLeft !== null && daysLeft < 0 && isComment && <Pill tone="neutral">Comment period closed</Pill>}
            </div>
            <FavoriteButton itemId={item.id} favorited={!!favorite} source="item" size="md" />
          </div>
          <h1 className="mt-2.5 font-display text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            {headline ?? item.title}
          </h1>
          {headline && <p className="mt-1.5 text-sm text-muted">{item.title}</p>}
          {item.status && (
            <p className="mt-2 text-sm tabular-nums text-muted">
              Status: {item.status}
              {item.last_action_at && ` (${new Date(item.last_action_at).toLocaleDateString()})`}
            </p>
          )}
          {item.last_action && item.last_action !== item.status && (
            <p className="mt-1 text-sm tabular-nums text-muted">
              Latest action: {item.last_action}
              {!item.status && item.last_action_at && ` (${new Date(item.last_action_at).toLocaleDateString()})`}
            </p>
          )}
        </div>
      </header>

      {favorite && favUpdate?.changed && favUpdate.summary && (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-favorite/40 bg-favorite-soft px-4 py-3 text-sm text-favorite"
        >
          <Bookmark className="h-4 w-4 shrink-0 fill-current" aria-hidden />
          <p>
            <strong className="font-semibold">Updated since you last checked:</strong> {favUpdate.summary}
          </p>
        </div>
      )}

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-8">
        {/* Left main column: What is this? -> How does it affect me? -> Where? */}
        <div className="min-w-0 space-y-6">
      <section>
        <SectionTitle>Advocacy on this item</SectionTitle>
        <Card>
          {!campaigns.direct.length && !alerts.length && <p>No campaign or published position for this exact item was found in the sources checked.</p>}
          {!!alerts.length && <ul className="mb-2 space-y-2">{alerts.map((alert) => (
            <li key={alert.organization + alert.url}>
              <strong>{alert.organization}</strong> {alert.position ? alert.position.toLowerCase() + " this item." : "references this item."}{" "}
              <a className="text-accent underline" target="_blank" rel="noreferrer" href={alert.url}>{alert.title}</a>
              <span className="block text-xs text-muted">{stateLabel[alert.state]}{alert.checked && " · " + reviewDate(alert.checked)}</span>
            </li>
          ))}</ul>}
          <p className="mt-1 text-xs text-muted">
            {latest ? `Source review ${reviewDate(latest)} · ${checked.length} of ${snapshot.length} directories reached.` : "Directory checks pending."}
          </p>
          {!!topicGroups.size && <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium">Organizations working on related topics ({topicGroups.size})</summary>
            <ul className="mt-2 space-y-1">
              {[...topicGroups].map((org) => <li key={org.url}>
                <a href={org.url} className="text-accent underline" target="_blank" rel="noreferrer">{org.name} ↗</a>
              </li>)}
            </ul>
          </details>}
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-accent underline">
            {(a?.topics ?? []).map((slug) => <Link key={slug} href={`/campaigns?topic=${encodeURIComponent(slug)}`}>Groups on {topicName(slug)}</Link>)}
            <Link href="/campaigns">All campaign sources</Link>
          </div>
        </Card>
      </section>
      {campaigns.direct.length > 0 && (
        <section>
          <SectionTitle>Who’s campaigning on this bill?</SectionTitle>
          {campaigns.direct.map((issue) => <CampaignIssueCard key={issue.title} issue={issue} snapshot={snapshot} />)}
        </section>
      )}
      {campaigns.related.length > 0 && (
        <section>
          <SectionTitle>Campaigns on related bills</SectionTitle>
          <div className="space-y-3">
            {campaigns.related.map((issue) => <CampaignIssueCard key={issue.title} issue={issue} snapshot={snapshot} />)}
          </div>
        </section>
      )}

          <IssueSummary
            analysis={a}
            description={item.description}
            url={item.url}
            footer={
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Is this relevant to you?</p>
                  <p className="text-xs text-muted">
                    Your answer tunes your feed for this item and similar topics. Favorite this issue above to keep following up on updates.
                  </p>
                </div>
                <RelevanceVote itemId={item.id} current={myVote.data?.relevant ?? null} source="item" size="sm" />
              </div>
            }
          />

          {showImpactCard && (
            <UnifiedImpactCard
              impact={impact}
              heuristic={a?.model === "heuristic"}
              itemId={item.id}
              showAssess={showAssess}
              assessment={assessment}
              initialHash={lastAssessment.data?.facts_hash ?? null}
              currentHash={currentHash}
              excludeFactKeys={scorecardQuestionKeys}
            />
          )}

          <Where
            places={item.item_locations}
            home={ctx.profile?.lat != null && ctx.profile?.lng != null ? { lat: ctx.profile.lat, lng: ctx.profile.lng } : null}
            zip={ctx.profile?.zip ?? null}
          />
        </div>

        {/* Right sticky action rail */}
        <aside className="mt-8 space-y-4 lg:sticky lg:top-20 lg:mt-0" aria-label="Take action">
          <Card>
            <h2 className="font-display text-xl font-semibold">
              {item.enacted_at ? "What you can do now" : "Make your voice heard"}
            </h2>

            {item.enacted_at && (
              <div className="mt-2 space-y-2 text-sm text-muted">
                <p>The vote is complete. You can ask your legislator how the law will roll out, raise a concern, or request follow-up changes.</p>
                <p>If an agency opens a public comment period on proposed rules, send feedback directly by its deadline.</p>
              </div>
            )}

            {isComment ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm leading-relaxed text-muted">
                  Anyone can submit a public comment. Agencies must review every comment, and specific, personal ones carry the most weight.
                </p>
                <div className="flex flex-col gap-2">
                  <LinkButton href={`/draft/${item.id}?kind=public_comment`} className="w-full">
                    <PenLine className="h-4 w-4" aria-hidden />
                    Draft my comment
                  </LinkButton>
                  {item.action_url && (
                    <LinkButton variant="secondary" href={item.action_url} target="_blank" rel="noreferrer" className="w-full">
                      Open comment form <ExternalLink className="h-4 w-4" aria-hidden />
                    </LinkButton>
                  )}
                </div>
              </div>
            ) : deciders.length ? (
              <div className="mt-3 space-y-2.5">
                <ul className="space-y-2.5">
                  {deciders.map((o) => (
                    <li key={o.id}>
                      <OfficialCard compact o={o} role={involved.get(o.id)} draftHref={`/draft/${item.id}?official=${encodeURIComponent(o.id)}`} />
                    </li>
                  ))}
                </ul>
                {otherSponsors.length > 0 && (
                  <p className="pt-1 text-xs text-muted">
                    Sponsored by {otherSponsors.map((io) => io.officials!.name).slice(0, 5).join(", ")}
                    {otherSponsors.length > 5 && ` and ${otherSponsors.length - 5} others`}.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-3 text-sm text-muted">
                We don&apos;t have your {LEVEL_LABEL[item.level].toLowerCase()} representatives yet.{" "}
                <Link className="text-accent underline" href="/onboarding?step=1">Check your ZIP code</Link>
                {item.action_url && (
                  <>
                    {" "}or{" "}
                    <a className="text-accent underline" href={item.action_url} target="_blank" rel="noreferrer">
                      see the official page
                    </a>
                  </>
                )}
                .
              </div>
            )}
          </Card>

          <Card>
            <Kicker className="mb-2 block">Track your civic action</Kicker>
            <ActionPanel itemId={item.id} actions={actions} done={(myActions.data ?? []).map((x) => x.type)} />
          </Card>
        </aside>
      </div>
    </article>
  );
}

function UnifiedImpactCard({
  impact,
  heuristic,
  itemId,
  showAssess,
  assessment,
  initialHash,
  currentHash,
  excludeFactKeys,
}: {
  impact: PersonalImpact;
  heuristic: boolean;
  itemId: string;
  showAssess: boolean;
  assessment: Assessment | null;
  initialHash: string | null;
  currentHash: string;
  excludeFactKeys: string[];
}) {
  const hasFacets = impact.facets.length > 0;
  const showDir = hasDirection(impact);
  const rest = hasFacets ? unaffectedFacets(impact) : [];

  return (
    <Card>
      {hasFacets && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Kicker>How this affects you</Kicker>
            <ImpactBadge impact={impact} size="lg" />
          </div>
          <ul className="mt-2 divide-y divide-line">
            {impact.facets.map((f) => (
              <ImpactRow key={f.facet} f={f} showDirection={showDir} />
            ))}
          </ul>
          {rest.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Little or no direct effect on: {rest.map((f) => FACETS[f].label).join(", ")}.
            </p>
          )}
          {impact.open.length > 0 && (
            <div className="mt-4 rounded-lg bg-paper px-3.5 pt-2.5">
              <Kicker className="block pt-0.5">Tell us more to personalize this</Kicker>
              <div className="divide-y divide-line">
                {impact.open.slice(0, 3).map((q) => (
                  <FactQuestion key={`${q.kind}:${q.key}`} q={q} source="item" itemId={itemId} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showAssess && (
        <AssessPanel
          embedded={hasFacets}
          itemId={itemId}
          initial={assessment}
          initialHash={initialHash}
          currentHash={currentHash}
          excludeFactKeys={excludeFactKeys}
        />
      )}

      {hasFacets && (
        <p className="mt-4 text-xs text-muted">
          {heuristic
            ? "Rough estimate from topic tags. A detailed AI estimate is on the way."
            : "AI estimate based on the item text and your profile. \"Helps\" and \"costs\" describe concrete effects on the groups named, not whether the policy is good. Check the source before deciding."}
        </p>
      )}
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
    <Card>
      <Kicker className="inline-flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 text-accent" aria-hidden /> Where
      </Kicker>
      {closest !== null && (
        <p className="mt-2 text-sm">
          {places.length > 1 ? "The nearest site is " : "This site is "}
          <strong className="tabular-nums">{formatMiles(closest)}</strong> from the middle of your ZIP code.
        </p>
      )}
      <ul className="mt-2 space-y-0.5 text-sm text-muted">
        {sorted.map((p) => (
          <li key={p.address} className="tabular-nums">
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
