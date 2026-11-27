import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Bookmark, Flame } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { getAreaProgress, getFeed, getIndexCounts, getMyOfficials, getProfile, getStats, type Place } from "@/lib/data";
import { areasFor } from "@/lib/coverage";
import { ItemCard } from "@/components/ItemCard";
import { FeedList, type FeedEntry } from "@/components/FeedList";
import { Card, Empty, Kicker, PageTitle, Pill, SectionTitle, cx } from "@/components/ui";
import { FEED_LEVELS, countByLevel, matchesLevel, sectionRanked, type FeedLevel, type Ranked } from "@/lib/relevance";
import { QuickQuestions } from "@/components/QuickQuestions";
import { LocalIndexProgress } from "@/components/LocalIndexProgress";

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/feed");
  const profile = await getProfile(supabase, user.id);
  if (!profile?.onboarded_at) redirect("/onboarding");

  const sp = await searchParams;
  const level = FEED_LEVELS.includes(sp.level as FeedLevel) ? (sp.level as FeedLevel) : "all";
  const [feed, stats, officials, counts, coverage] = await Promise.all([
    getFeed(supabase, user.id),
    getStats(supabase, user.id),
    getMyOfficials(supabase, user.id),
    getIndexCounts(supabase),
    getAreaProgress(supabase, areasFor(profile.state, profile.jurisdiction_ids)),
  ]);

  const repsById = new Map(officials.map((o) => [o.id, o]));
  const repsFor = (r: Ranked) => r.my_official_ids.flatMap((id) => repsById.get(id) ?? []);
  const toEntries = (items: Ranked[]): FeedEntry[] =>
    items.map((r) => ({
      r,
      reps: repsFor(r),
      place: feed.places[r.item.id] as Place | undefined,
      updateSummary: feed.favoriteUpdates[r.item.id] ?? null,
    }));

  const levelCounts = countByLevel(feed.ranked);
  const { actNow, followingUp, radar, done, totals } = sectionRanked(
    feed.ranked.filter((r) => matchesLevel(r.item, level)),
  );
  const picked = levelCounts.all;
  const updatedFavs = Object.keys(feed.favoriteUpdates).length;

  const { level: tier } = stats;
  const pct = tier.next
    ? Math.max(0, Math.min(100, Math.round(((stats.points - tier.current) / (tier.next - tier.current)) * 100)))
    : 100;
  const earnedBadges = stats.badges.filter((b) => b.awarded_at).length;

  return (
    <div>
      <PageTitle sub="What's being decided that affects you, most urgent first.">Your civic feed</PageTitle>

      {/* Mobile compact summary pill so Act now stays immediately above the fold */}
      <Link
        href="/profile"
        className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-2.5 text-xs transition hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:hidden"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            <strong className="font-display text-base tabular-nums text-ink">{stats.points}</strong>{" "}
            <span className="text-muted">pts · {tier.title}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-muted">
            <Flame className={cx("h-3.5 w-3.5", stats.streak > 0 ? "text-urgent" : "text-muted")} aria-hidden />
            {stats.streak > 0 ? `${stats.streak}-week streak` : "Start a streak"}
          </span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 font-medium text-accent">
          Profile <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </Link>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <nav className="mb-2 flex flex-wrap gap-1.5" aria-label="Filter by level">
            {FEED_LEVELS.map((l) => {
              const active = l === level;
              return (
                <Link
                  key={l}
                  href={l === "all" ? "/feed" : `/feed?level=${l}`}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    active
                      ? "border-accent bg-accent text-white dark:text-paper"
                      : "border-line bg-card text-muted hover:border-accent hover:text-ink",
                  )}
                >
                  <span className="capitalize">{l === "all" ? "All levels" : l}</span>
                  <span className={cx("text-xs tabular-nums", active ? "opacity-85" : "text-muted")}>({levelCounts[l]})</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-4">
            <LocalIndexProgress zip={profile.zip} areas={coverage} now={Date.now()} />
          </div>

          <SectionTitle hint={sectionHint("Deadlines in the next 2 weeks", actNow.length, totals.actNow)}>Act now</SectionTitle>
          {actNow.length ? (
            <FeedList entries={toEntries(actNow)} hero />
          ) : (
            <Empty>No deadlines coming up on your issues. We&apos;ll email you when one opens.</Empty>
          )}

          {feed.questions.length > 0 && (
            <div className="mt-6 lg:hidden">
              <QuickQuestions questions={feed.questions} />
            </div>
          )}

          {followingUp.length > 0 && (
            <>
              <SectionTitle
                hint={sectionHint(
                  <>
                    Issues you favorited to keep tracking ·{" "}
                    <Link className="text-accent hover:underline" href="/favorites">
                      View all
                    </Link>
                  </>,
                  followingUp.length,
                  totals.followingUp,
                )}
              >
                Following up
              </SectionTitle>
              <FeedList entries={toEntries(followingUp)} />
            </>
          )}

          <SectionTitle hint={sectionHint("Matched to your issues, most relevant first", radar.length, totals.radar)}>On your radar</SectionTitle>
          {radar.length ? (
            <FeedList entries={toEntries(radar)} />
          ) : level === "state" && !actNow.length && !followingUp.length ? (
            <Empty>
              No {profile.state ?? "state"} bills match your interests right now. Between legislative sessions, this shows laws signed
              in the last four months.{" "}
              <Link className="text-accent underline" href="/browse?level=state">Browse all state items</Link> or{" "}
              <Link className="text-accent underline" href="/onboarding?step=3">edit interests</Link>.
            </Empty>
          ) : level === "federal" && !actNow.length && !followingUp.length ? (
            <Empty>
              No federal bills or public comment periods match your interests right now.{" "}
              <Link className="text-accent underline" href="/browse?level=federal">Browse all federal items</Link> or{" "}
              <Link className="text-accent underline" href="/onboarding?step=3">edit interests</Link>.
            </Empty>
          ) : (
            <Empty>
              Nothing else matches yet. Try following more topics or adding a pet issue.{" "}
              <Link className="text-accent underline" href="/onboarding?step=3">Edit interests</Link>
            </Empty>
          )}

          {done.length > 0 && (
            <>
              <SectionTitle hint={sectionHint(undefined, done.length, totals.done)}>You took action</SectionTitle>
              <ul className="space-y-2">
                {done.map((r) => (
                  <li key={r.item.id}>
                    <ItemCard r={r} variant="compact" />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <aside className="mt-8 space-y-4 lg:sticky lg:top-20 lg:mt-0" aria-label="Civic progress and feed tools">
          <Card className="hidden lg:block">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <Kicker>Level {tier.level}</Kicker>
                <p className="mt-0.5 font-display text-lg font-semibold">{tier.title}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl font-semibold tabular-nums text-accent">{stats.points}</p>
                <p className="text-xs text-muted">points</p>
              </div>
            </div>
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-label="Level progress"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <Flame className={cx("h-3.5 w-3.5", stats.streak > 0 ? "text-urgent" : "text-muted")} aria-hidden />
                {stats.streak > 0 ? `${stats.streak}-week streak` : "No streak yet"}
              </span>
              <span className="tabular-nums">{earnedBadges} of {stats.badges.length} badges</span>
            </div>
            <Link
              href="/profile"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              View profile <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </Card>

          <QuickQuestions className="hidden lg:block" questions={feed.questions} />

          <Card className="text-xs text-muted">
            <div className="flex items-center justify-between gap-2">
              <Kicker className="inline-flex items-center gap-1">
                <Bookmark className="h-3.5 w-3.5 text-favorite" aria-hidden /> Favorites
              </Kicker>
              {updatedFavs > 0 && (
                <Pill tone="favorite" className="tabular-nums">
                  {updatedFavs} updated
                </Pill>
              )}
            </div>
            <p className="mt-1.5 text-sm text-ink">
              {feed.favoriteCount > 0 ? (
                <>
                  Following up on <strong className="font-display text-lg tabular-nums">{feed.favoriteCount}</strong>{" "}
                  {feed.favoriteCount === 1 ? "issue" : "issues"}.
                </>
              ) : (
                "Save important issues to track status updates and follow-up deadlines."
              )}
            </p>
            <Link
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              href="/favorites"
            >
              View favorites <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </Card>

          <Coverage picked={picked} {...counts} />
        </aside>
      </div>
    </div>
  );
}

function sectionHint(base: ReactNode | undefined, shown: number, total: number) {
  if (total <= shown) return base;
  const cap = <span className="tabular-nums">Showing top {shown} of {total}</span>;
  return base ? (
    <>
      {base} · {cap}
    </>
  ) : (
    cap
  );
}

/** Compact summary of the index in the sidebar, so a short feed reads as "filtered", not "empty". */
function Coverage({
  picked,
  indexed,
  inArea,
  inAreaActive,
}: {
  picked: number;
  indexed: number;
  inArea: number;
  inAreaActive: number;
}) {
  const elsewhere = indexed - inArea;
  const stale = inArea - inAreaActive;
  return (
    <Card className="text-xs text-muted">
      <Kicker>Index coverage</Kicker>
      <p className="mt-1.5 text-sm text-ink">
        <strong className="font-display text-lg tabular-nums">{picked}</strong> picked for you from{" "}
        <strong className="font-display text-lg tabular-nums">{inAreaActive}</strong> active items in your area.
      </p>
      {(elsewhere > 0 || stale > 0 || indexed > inAreaActive) && (
        <p className="mt-1 tabular-nums leading-relaxed">
          {indexed} indexed total
          {elsewhere > 0 || stale > 0
            ? ` (${[elsewhere > 0 && `${elsewhere} outside your area`, stale > 0 && `${stale} inactive`].filter(Boolean).join(", ")})`
            : ""}
          .
        </p>
      )}
      <Link
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        href="/browse"
      >
        Browse everything <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </Card>
  );
}
