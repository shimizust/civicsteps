import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getFeed, getMyOfficials, getProfile, getStats } from "@/lib/data";
import { ItemCard } from "@/components/ItemCard";
import { Card, Empty, LinkButton, PageTitle, SectionTitle } from "@/components/ui";
import type { Ranked } from "@/lib/relevance";

const LEVELS = ["all", "city", "state", "federal"] as const;

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/feed");
  const profile = await getProfile(supabase, user.id);
  if (!profile?.onboarded_at) redirect("/onboarding");

  const { level = "all" } = await searchParams;
  const [feed, stats, officials] = await Promise.all([getFeed(supabase, user.id), getStats(supabase, user.id), getMyOfficials(supabase, user.id)]);
  const repsById = new Map(officials.map((o) => [o.id, o]));
  const repsFor = (r: Ranked) => r.my_official_ids.flatMap((id) => repsById.get(id) ?? []);
  const keep = (r: Ranked) => level === "all" || r.item.level === level || (level === "city" && r.item.level === "county");
  const actNow = feed.actNow.filter(keep);
  const yourReps = feed.yourReps.filter(keep);
  const radar = feed.radar.filter(keep);

  return (
    <div>
      <PageTitle sub="What's being decided that affects you, most urgent first.">Your civic feed</PageTitle>

      <Card className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span><strong className="font-display text-xl">{stats.points}</strong> points · {stats.level.title}</span>
        <span>{stats.streak > 0 ? `🔥 ${stats.streak}-week streak` : "Take an action this week to start a streak"}</span>
        <span className="text-muted">{stats.badges.filter((b) => b.awarded_at).length} of {stats.badges.length} badges</span>
      </Card>

      <nav className="flex gap-1.5" aria-label="Filter by level">
        {LEVELS.map((l) => (
          <LinkButton key={l} href={l === "all" ? "/feed" : `/feed?level=${l}`} variant={l === level ? "primary" : "secondary"} className="px-3 py-1.5 capitalize">
            {l === "all" ? "All levels" : l}
          </LinkButton>
        ))}
      </nav>

      <SectionTitle hint="Deadlines in the next 2 weeks">Act now</SectionTitle>
      {actNow.length ? <List items={actNow} repsFor={repsFor} hero /> : <Empty>No deadlines coming up on your issues. We&apos;ll email you when one opens.</Empty>}

      {yourReps.length > 0 && (
        <>
          <SectionTitle hint="Bills your representatives are sponsoring or voting on">Your reps are involved</SectionTitle>
          <List items={yourReps} repsFor={repsFor} />
        </>
      )}

      <SectionTitle>On your radar</SectionTitle>
      {radar.length ? (
        <List items={radar} repsFor={repsFor} />
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
function List({ items, repsFor, hero }: { items: Ranked[]; repsFor: RepsFor; hero?: boolean }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((r, i) => {
        const big = hero && i === 0;
        return (
          <li key={r.item.id} className={big ? "sm:col-span-2" : undefined}>
            <ItemCard r={r} reps={repsFor(r)} variant={big ? "hero" : "default"} />
          </li>
        );
      })}
    </ul>
  );
}
