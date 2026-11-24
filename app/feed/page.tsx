import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getFeed, getIndexCounts, getMyOfficials, getProfile, getStats, pendingAreas, type Place } from "@/lib/data";
import { areasFor } from "@/lib/coverage";
import { ItemCard } from "@/components/ItemCard";
import { Card, Empty, LinkButton, PageTitle, SectionTitle } from "@/components/ui";
import type { Ranked } from "@/lib/relevance";
import type { RankedQuestion } from "@/lib/impact";
import { FactQuestion } from "@/components/FactQuestion";
import { RelevanceVote } from "@/components/RelevanceVote";

const LEVELS = ["all", "city", "state", "federal"] as const;

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/feed");
  const profile = await getProfile(supabase, user.id);
  if (!profile?.onboarded_at) redirect("/onboarding");

  const { level = "all" } = await searchParams;
  const [feed, stats, officials, counts, gathering] = await Promise.all([
    getFeed(supabase, user.id),
    getStats(supabase, user.id),
    getMyOfficials(supabase, user.id),
    getIndexCounts(supabase),
    pendingAreas(supabase, areasFor(profile.state, profile.jurisdiction_ids)),
  ]);
  const repsById = new Map(officials.map((o) => [o.id, o]));
  const repsFor = (r: Ranked) => r.my_official_ids.flatMap((id) => repsById.get(id) ?? []);
  const keep = (r: Ranked) => level === "all" || r.item.level === level || (level === "city" && r.item.level === "county");
  const actNow = feed.actNow.filter(keep);
  const yourReps = feed.yourReps.filter(keep);
  const radar = feed.radar.filter(keep);
  const picked = feed.actNow.length + feed.yourReps.length + feed.radar.length;

  return (
    <div>
      <PageTitle sub="What's being decided that affects you, most urgent first.">Your civic feed</PageTitle>

      <Card className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span><strong className="font-display text-xl">{stats.points}</strong> points · {stats.level.title}</span>
        <span>{stats.streak > 0 ? `🔥 ${stats.streak}-week streak` : "Take an action this week to start a streak"}</span>
        <span className="text-muted">{stats.badges.filter((b) => b.awarded_at).length} of {stats.badges.length} badges</span>
      </Card>

      <Coverage picked={picked} {...counts} gathering={gathering} />

      <nav className="flex gap-1.5" aria-label="Filter by level">
        {LEVELS.map((l) => (
          <LinkButton key={l} href={l === "all" ? "/feed" : `/feed?level=${l}`} variant={l === level ? "primary" : "secondary"} className="px-3 py-1.5 capitalize">
            {l === "all" ? "All levels" : l}
          </LinkButton>
        ))}
      </nav>

      <QuickQuestions questions={feed.questions} />

      <SectionTitle hint="Deadlines in the next 2 weeks">Act now</SectionTitle>
      {actNow.length ? <List items={actNow} repsFor={repsFor} places={feed.places} hero /> : <Empty>No deadlines coming up on your issues. We&apos;ll email you when one opens.</Empty>}

      {yourReps.length > 0 && (
        <>
          <SectionTitle hint="Bills your representatives are sponsoring or voting on">Your reps are involved</SectionTitle>
          <List items={yourReps} repsFor={repsFor} places={feed.places} />
        </>
      )}

      <SectionTitle>On your radar</SectionTitle>
      {radar.length ? (
        <List items={radar} repsFor={repsFor} places={feed.places} />
      ) : (
        <Empty>
          Nothing else matches yet. Try following more topics or adding a pet issue.{" "}
          <a className="text-accent underline" href="/onboarding?step=3">Edit interests</a>
        </Empty>
      )}

      {feed.done.length > 0 && (
        <>
          <SectionTitle>You took action</SectionTitle>
          <ul className="space-y-2">
            {feed.done.map((r) => <li key={r.item.id}><ItemCard r={r} variant="compact" /></li>)}
          </ul>
        </>
      )}
    </div>
  );
}

type RepsFor = (r: Ranked) => Awaited<ReturnType<typeof getMyOfficials>>;

/** Cards in a 2-column grid on wider screens; `hero` makes the first (most urgent) one full-width and larger. */
function List({ items, repsFor, places, hero }: { items: Ranked[]; repsFor: RepsFor; places: Record<string, Place>; hero?: boolean }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((r, i) => {
        const big = hero && i === 0;
        return (
          <li key={r.item.id} className={big ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"}>
            <div className="flex-1">
              <ItemCard r={r} reps={repsFor(r)} variant={big ? "hero" : "default"} place={places[r.item.id]} />
            </div>
            <div className="flex justify-end">
              <RelevanceVote itemId={r.item.id} current={r.vote} source="feed" />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** How much of the index the feed draws from, so a short feed reads as "filtered", not "empty". */
function Coverage({
  picked,
  indexed,
  inArea,
  inAreaActive,
  gathering,
}: {
  picked: number;
  indexed: number;
  inArea: number;
  inAreaActive: number;
  gathering: string[];
}) {
  const elsewhere = indexed - inArea;
  const stale = inArea - inAreaActive;
  return (
    <Card className="mb-6 text-sm">
      <p>
        <strong className="font-display text-xl">{picked}</strong> picked for you from{" "}
        <strong className="font-display text-xl">{indexed}</strong> indexed items.
      </p>
      <p className="mt-1 text-muted">
        {inAreaActive} are in your area and still active
        {elsewhere > 0 || stale > 0 ? (
          <>
            {" "}({[elsewhere > 0 && `${elsewhere} are elsewhere`, stale > 0 && `${stale} have no recent activity`].filter(Boolean).join(", ")})
          </>
        ) : null}
        . Missing something? <Link className="text-accent underline" href="/browse">Browse everything</Link> and mark what&apos;s relevant to tune this feed.
      </p>
      {gathering.length > 0 && (
        <p className="mt-2 text-muted">
          We&apos;re still pulling in recent {gathering.join(" and ")} for your area, since you&apos;re one of our first members there. Check back soon.
        </p>
      )}
    </Card>
  );
}

/** The few answers that would sharpen the most "how this affects you" estimates in this feed. */
function QuickQuestions({ questions }: { questions: RankedQuestion[] }) {
  if (!questions.length) return null;
  return (
    <Card className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Quick questions</h2>
      <p className="mt-1 text-sm text-muted">
        Some items depend on details we don&apos;t know yet. Answer what you like; we only use it to estimate how items affect you, and you can change it on your profile.
      </p>
      <div className="mt-1 divide-y divide-line">
        {questions.map((q) => (
          <FactQuestion
            key={`${q.kind}:${q.key}`}
            q={q}
            source="feed"
            hint={`Personalizes ${q.itemCount} ${q.itemCount === 1 ? "item" : "items"}`}
          />
        ))}
      </div>
    </Card>
  );
}
