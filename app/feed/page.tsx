import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Bookmark, CheckCircle2, Clock, Flame, Loader2 } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { getAreaProgress, getFeed, getIndexCounts, getMyOfficials, getProfile, getStats, type Place } from "@/lib/data";
import {
  areaPhaseDetail,
  areaProgressPercent,
  areasFor,
  citySupportFor,
  formatList,
  isPhaseInProgress,
  summarizeCoverage,
  type AreaPhase,
  type AreaProgressRow,
  type CitySupport,
  type CoverageScopeKind,
} from "@/lib/coverageStatus";
import { placeName } from "@/lib/place";
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
  const now = Date.now();
  const place = placeName(profile.jurisdiction_ids, profile.state);
  const citySupport = citySupportFor(profile.jurisdiction_ids);
  const coverageSummary = summarizeCoverage(coverage, now);
  const levelEmpty = !actNow.length && !followingUp.length && !radar.length && !done.length;
  const showCityStatusEmpty =
    level === "city" && levelEmpty && (!profile.zip || !citySupport.supported || coverageSummary.cityPending);
  const showStateStatusEmpty = level === "state" && levelEmpty && (!profile.zip || coverageSummary.statePending);

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
              const tabIndexing =
                (l === "city" && coverageSummary.cityInProgress) || (l === "state" && coverageSummary.stateInProgress);
              return (
                <Link
                  key={l}
                  href={l === "all" ? "/feed" : `/feed?level=${l}`}
                  aria-current={active ? "page" : undefined}
                  title={tabIndexing ? "Indexing in progress" : undefined}
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    active
                      ? "border-accent bg-accent text-white dark:text-paper"
                      : "border-line bg-card text-muted hover:border-accent hover:text-ink",
                  )}
                >
                  <span className="capitalize">{l === "all" ? "All levels" : l}</span>
                  <span className={cx("text-xs tabular-nums", active ? "opacity-85" : "text-muted")}>({levelCounts[l]})</span>
                  {tabIndexing && (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      <span className="sr-only">indexing in progress</span>
                    </>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4">
            <LocalIndexProgress zip={profile.zip} place={place} citySupport={citySupport} areas={coverage} now={now} />
          </div>

          {showCityStatusEmpty ? (
            <Empty>
              {!profile.zip ? (
                <>
                  No active ZIP code is set yet. Add a ZIP code from the menu above to see city council items and state bills
                  for your area.{" "}
                  <Link className="text-accent underline" href="/feed">
                    View all levels
                  </Link>{" "}
                  or{" "}
                  <Link className="text-accent underline" href="/browse">
                    browse all items
                  </Link>
                  .
                </>
              ) : (
                <>
                  {citySupport.supported && coverageSummary.cityInProgress ? (
                    <>
                      We&apos;re indexing recent {citySupport.name} council items right now. They&apos;ll appear here
                      automatically as they&apos;re analyzed.
                    </>
                  ) : citySupport.supported && coverageSummary.cityPending ? (
                    <>
                      Recent {citySupport.name} council items are scheduled for the next indexing run and will appear here once
                      analyzed.
                    </>
                  ) : !citySupport.supported && citySupport.place ? (
                    <>
                      City council agendas aren&apos;t connected for {citySupport.place} yet, so city-level items aren&apos;t
                      being indexed here (currently {formatList(citySupport.supportedCities)}).{" "}
                      {coverageSummary.stateInProgress
                        ? `Your ${profile.state ?? "state"} bills are being indexed now and federal items are already in your feed.`
                        : `Your ${profile.state ?? "state"} bills and federal items${profile.zip ? ` for ZIP ${profile.zip}` : ""} are still in your feed.`}
                    </>
                  ) : (
                    <>
                      {profile.zip ? `ZIP ${profile.zip}` : "This ZIP"} isn&apos;t inside a covered city boundary, so city
                      council items aren&apos;t indexed here.{" "}
                      {coverageSummary.stateInProgress
                        ? `Your ${profile.state ?? "state"} bills are being indexed now and federal items are already in your feed.`
                        : `Your ${profile.state ?? "state"} bills and federal items are still in your feed.`}
                    </>
                  )}{" "}
                  <Link className="text-accent underline" href="/feed">
                    View all levels
                  </Link>{" "}
                  or{" "}
                  <Link className="text-accent underline" href={citySupport.supported ? "/browse" : "/browse?level=city&scope=all"}>
                    {citySupport.supported ? "browse all items" : "browse indexed cities"}
                  </Link>
                  .
                </>
              )}
            </Empty>
          ) : showStateStatusEmpty ? (
            <Empty>
              {!profile.zip
                ? "No active ZIP code is set yet. Add a ZIP code from the menu above to see state bills for your area."
                : coverageSummary.stateInProgress
                  ? `We're indexing recent ${profile.state ?? "state"} bills right now. They'll appear here automatically as they're analyzed.`
                  : `Recent ${profile.state ?? "state"} bills are scheduled for the next indexing run and will appear here once analyzed.`}{" "}
              <Link className="text-accent underline" href="/feed">
                View all levels
              </Link>{" "}
              or{" "}
              <Link className="text-accent underline" href="/browse">
                browse all items
              </Link>
              .
            </Empty>
          ) : (
            <>
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

              <SectionTitle hint={sectionHint("Matched to your issues, most relevant first", radar.length, totals.radar)}>
                On your radar
              </SectionTitle>
              {radar.length ? (
                <FeedList entries={toEntries(radar)} />
              ) : level === "city" && !profile.zip ? (
                <Empty>
                  No active ZIP code is set yet. Add a ZIP code from the menu above to see city council items for your area.{" "}
                  <Link className="text-accent underline" href="/feed">
                    View all levels
                  </Link>{" "}
                  or{" "}
                  <Link className="text-accent underline" href="/browse">
                    browse all items
                  </Link>
                  .
                </Empty>
              ) : level === "city" && !citySupport.supported ? (
                <Empty>
                  {citySupport.place
                    ? `City council agendas aren't connected for ${citySupport.place} yet (currently ${formatList(citySupport.supportedCities)}).`
                    : "This ZIP code isn't inside a covered city boundary, so city council items aren't available here."}{" "}
                  <Link className="text-accent underline" href="/browse?level=city&scope=all">
                    Browse indexed cities
                  </Link>{" "}
                  or{" "}
                  <Link className="text-accent underline" href="/feed">
                    view all levels
                  </Link>
                  .
                </Empty>
              ) : level === "city" && !actNow.length && !followingUp.length && citySupport.supported ? (
                <Empty>
                  No {citySupport.name} council items match your interests right now.{" "}
                  <Link className="text-accent underline" href="/browse?level=city">
                    Browse all city items
                  </Link>{" "}
                  or{" "}
                  <Link className="text-accent underline" href="/onboarding?step=3">
                    edit interests
                  </Link>
                  .
                </Empty>
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
            </>
          )}

          {(showCityStatusEmpty || showStateStatusEmpty) && feed.questions.length > 0 && (
            <div className="mt-6 lg:hidden">
              <QuickQuestions questions={feed.questions} />
            </div>
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

          <Coverage
            picked={picked}
            {...counts}
            zip={profile.zip}
            citySupport={citySupport}
            rows={coverageSummary.rows}
          />
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

type CoverageRowSummary = { area: AreaProgressRow; phase: AreaPhase; kind: CoverageScopeKind };

function LevelStatusRow({ label, row, unavailable }: { label: string; row?: CoverageRowSummary; unavailable?: string }) {
  if (unavailable) {
    return (
      <li className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-muted">
          <Clock className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 text-muted">{unavailable}</span>
      </li>
    );
  }
  if (!row) {
    return (
      <li className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-ink">
          <CheckCircle2 className="h-3 w-3 shrink-0 text-benefit" aria-hidden />
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 text-muted">Indexed</span>
      </li>
    );
  }

  const inProg = isPhaseInProgress(row.phase);
  const pct = areaProgressPercent(row.area, row.phase);
  return (
    <li className="text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-ink">
          {inProg ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" aria-hidden />
          ) : row.phase === "ready" ? (
            <CheckCircle2 className="h-3 w-3 shrink-0 text-benefit" aria-hidden />
          ) : (
            <Clock className="h-3 w-3 shrink-0 text-muted" aria-hidden />
          )}
          <span className="truncate">{label}</span>
        </span>
        <span className={cx("shrink-0 tabular-nums", inProg ? "font-medium text-accent" : "text-muted")}>
          {inProg ? `${pct}%` : row.phase === "ready" ? "Indexed" : "Scheduled"}
        </span>
      </div>
      {inProg && (
        <div className="mt-1">
          <div className="h-1 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-0.5 text-[11px] text-muted">{areaPhaseDetail(row.area, row.phase)}</p>
        </div>
      )}
    </li>
  );
}

/** Compact summary of the index in the sidebar, so a short feed reads as "filtered", not "empty". */
function Coverage({
  picked,
  indexed,
  inArea,
  inAreaActive,
  zip,
  citySupport,
  rows,
}: {
  picked: number;
  indexed: number;
  inArea: number;
  inAreaActive: number;
  zip: string | null;
  citySupport: CitySupport;
  rows: CoverageRowSummary[] | null;
}) {
  const elsewhere = indexed - inArea;
  const stale = inArea - inAreaActive;
  const cityRow = rows?.find((r) => r.kind === "city");
  const stateRow = rows?.find((r) => r.kind === "state");
  const cityLabel = citySupport.supported
    ? `City (${citySupport.name})`
    : citySupport.place
      ? `City (${citySupport.place})`
      : "City";

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
      <div className="mt-3 border-t border-line/70 pt-2.5">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">By level</p>
        <ul className="space-y-1.5">
          <LevelStatusRow
            label={cityLabel}
            row={cityRow}
            unavailable={
              !zip
                ? "No ZIP set"
                : !citySupport.supported
                  ? citySupport.place
                    ? "Not connected"
                    : "Outside city limits"
                  : undefined
            }
          />
          <LevelStatusRow
            label={stateRow ? stateRow.area.label : "State bills"}
            row={stateRow}
            unavailable={!zip ? "No ZIP set" : undefined}
          />
          <LevelStatusRow label="Federal" />
        </ul>
      </div>
      <Link
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        href="/browse"
      >
        Browse everything <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </Card>
  );
}
