import Link from "next/link";
import { redirect } from "next/navigation";
import { Calendar, Clock, Search, X } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { BROWSE_PAGE_SIZE, browseItems, getAreaProgress, getFavoriteIds, getFeed, getIndexCounts, getProfile, type BrowseRow } from "@/lib/data";
import { areasFor } from "@/lib/coverage";
import { feedStatus, type Feed, type FeedStatus } from "@/lib/relevance";
import { TOPICS, TOPIC_SLUGS } from "@/lib/taxonomy";
import { typeLabel } from "@/components/ItemCard";
import { TopicTile } from "@/components/TopicTile";
import { RelevanceVote } from "@/components/RelevanceVote";
import { FavoriteButton } from "@/components/FavoriteButton";
import { BrowseFilters } from "@/components/BrowseFilters";
import { LocalIndexProgress } from "@/components/LocalIndexProgress";
import { Card, Empty, Input, Kicker, LEVEL_LABEL, LinkButton, PageTitle, Pill, cx, deadlineLabel } from "@/components/ui";

const LEVELS = ["all", "city", "state", "federal"] as const;

const STATUS: Record<FeedStatus, { label: string; tone: "accent" | "neutral" | "cost" | "favorite"; hint?: string }> = {
  in_feed: { label: "In your feed", tone: "accent" },
  favorited: { label: "Favorited", tone: "favorite", hint: "Pinned to your Favorites and Following up feed" },
  acted: { label: "You acted", tone: "accent" },
  not_relevant: { label: "Hidden: marked not relevant", tone: "cost" },
  outside_area: { label: "Outside your area", tone: "neutral", hint: "Not for where you live, so it can't reach your feed" },
  inactive: { label: "No recent activity", tone: "neutral", hint: "No deadline ahead and no action in the last 45 days" },
  ranked_lower: { label: "Matched, ranked lower", tone: "neutral", hint: "Relevant, but your feed shows the top 15 per section" },
  no_match: { label: "Not matched to you", tone: "neutral", hint: "Didn't hit your interests, reps or groups. Mark it relevant if it should" },
};

type Params = { q?: string; level?: string; scope?: string; topic?: string; sort?: string; page?: string };

export default async function BrowsePage({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/browse");
  const profile = await getProfile(supabase, user.id);
  if (!profile?.onboarded_at) redirect("/onboarding");

  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 200) ?? "";
  const level = LEVELS.includes(sp.level as (typeof LEVELS)[number]) && sp.level !== "all" ? sp.level! : null;
  const scope = sp.scope === "all" ? "all" : "area";
  const topic = sp.topic && TOPIC_SLUGS.has(sp.topic) ? sp.topic : null;
  const sort = sp.sort === "deadline" ? "deadline" : "recent";
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);

  const [{ rows, total }, feed, counts, coverage, favoriteIds] = await Promise.all([
    browseItems(supabase, { query: q, level, scope, topic, sort, page }),
    getFeed(supabase, user.id),
    getIndexCounts(supabase),
    getAreaProgress(supabase, areasFor(profile.state, profile.jurisdiction_ids)),
    getFavoriteIds(supabase, user.id),
  ]);

  const href = (over: Partial<Params>) => {
    const next = {
      q: q || undefined,
      level: level ?? undefined,
      scope: scope === "all" ? "all" : undefined,
      topic: topic ?? undefined,
      sort: sort === "deadline" ? "deadline" : undefined,
      page: undefined,
      ...over,
    };
    const qs = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1]));
    return qs.size ? `/browse?${qs}` : "/browse";
  };
  const pages = Math.ceil(total / BROWSE_PAGE_SIZE);
  const parentTopics = TOPICS.filter((t) => !t.parent);
  const hasFilters = Boolean(q || level || scope === "all" || topic || sort === "deadline");

  return (
    <div>
      <PageTitle sub="Everything we've indexed, including items your feed filtered out. Marking items relevant or not tunes your feed.">
        Browse all items
      </PageTitle>

      <LocalIndexProgress zip={profile.zip} areas={coverage} now={Date.now()} />

      <form action="/browse" className="flex gap-2" role="search">
        {level && <input type="hidden" name="level" value={level} />}
        {scope === "all" && <input type="hidden" name="scope" value="all" />}
        {topic && <input type="hidden" name="topic" value={topic} />}
        {sort === "deadline" && <input type="hidden" name="sort" value="deadline" />}
        <label className="relative flex-1">
          <span className="sr-only">Search items</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search titles and summaries, e.g. national parks, rent, BART"
            className="pl-9 pr-9"
          />
          {q && (
            <Link
              href={href({ q: undefined })}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <X className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </label>
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:text-paper"
        >
          Search
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <nav className="inline-flex flex-wrap rounded-lg border border-line bg-card p-0.5" aria-label="Filter by level">
            {LEVELS.map((l) => {
              const active = (level ?? "all") === l;
              return (
                <Link
                  key={l}
                  href={href({ level: l === "all" ? undefined : l })}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "rounded-md px-3 py-1 text-sm capitalize transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    active ? "bg-accent font-medium text-white dark:text-paper" : "text-muted hover:text-ink",
                  )}
                >
                  {l === "all" ? "All levels" : l}
                </Link>
              );
            })}
          </nav>

          <nav className="inline-flex rounded-full border border-line bg-paper p-0.5" aria-label="Filter by area">
            <Link
              href={href({ scope: undefined })}
              aria-current={scope === "area" ? "page" : undefined}
              className={cx(
                "rounded-full px-3 py-1 text-xs font-medium tabular-nums transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                scope === "area" ? "bg-card text-accent shadow-xs" : "text-muted hover:text-ink",
              )}
            >
              Your area ({counts.inArea})
            </Link>
            <Link
              href={href({ scope: "all" })}
              aria-current={scope === "all" ? "page" : undefined}
              className={cx(
                "rounded-full px-3 py-1 text-xs font-medium tabular-nums transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                scope === "all" ? "bg-card text-accent shadow-xs" : "text-muted hover:text-ink",
              )}
            >
              Everywhere ({counts.indexed})
            </Link>
          </nav>
        </div>

        <BrowseFilters q={q} level={level} scope={scope} topic={topic} sort={sort} topics={parentTopics} />
      </div>

      <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <p className="tabular-nums">
          {total} {total === 1 ? "item" : "items"}
          {q && <> matching &ldquo;{q}&rdquo;</>}
          {pages > 1 && ` · page ${page + 1} of ${pages}`}
        </p>
        {hasFilters && (
          <Link
            href="/browse"
            className="text-xs font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Clear all filters
          </Link>
        )}
      </div>

      {rows.length ? (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.item.id}>
              <Row r={r} feed={feed} favorited={favoriteIds.has(r.item.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty>
          Nothing indexed matches that{scope === "area" ? " in your area" : ""}.{" "}
          {scope === "area" && (
            <Link className="text-accent underline" href={href({ scope: "all" })}>
              Search everywhere
            </Link>
          )}
          {hasFilters && (
            <>
              {" "}or{" "}
              <Link className="text-accent underline" href="/browse">
                clear filters
              </Link>
            </>
          )}
        </Empty>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex justify-between" aria-label="Pages">
          {page > 0 ? <LinkButton variant="secondary" href={href({ page: String(page - 1) })}>← Previous</LinkButton> : <span />}
          {page + 1 < pages && <LinkButton variant="secondary" href={href({ page: String(page + 1) })}>Next →</LinkButton>}
        </nav>
      )}
    </div>
  );
}

function Row({ r, feed, favorited }: { r: BrowseRow; feed: Feed; favorited: boolean }) {
  const { item, analysis } = r;
  const headline = analysis.headline?.trim() || item.title;
  const status = STATUS[feedStatus(item.id, { ...r, favorited }, feed)];
  const deadline = item.comment_deadline ?? item.event_at;
  const daysLeft = deadline ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000) : null;
  const open = daysLeft !== null && daysLeft >= 0;
  const deadlineText = open ? deadlineLabel(daysLeft, item.comment_deadline ? "comment" : "event") : null;

  return (
    <Card className="flex gap-3.5 !p-3.5 transition hover:border-accent sm:!p-4">
      <TopicTile topics={analysis.topics} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          <Kicker>
            {LEVEL_LABEL[item.level]} · {typeLabel(item)}
          </Kicker>
          <Pill tone={status.tone}>{status.label}</Pill>
          {deadlineText && (
            <Pill tone={daysLeft! <= 7 ? "urgent" : "accent"} className="tabular-nums">
              <Clock className="h-3 w-3" aria-hidden />
              {deadlineText}
            </Pill>
          )}
          {!deadlineText && item.last_action_at && (
            <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted">
              <Calendar className="h-3 w-3" aria-hidden />
              {new Date(item.last_action_at).toLocaleDateString()}
            </span>
          )}
        </div>
        <Link
          href={`/items/${item.id}`}
          className="mt-1.5 block rounded font-medium leading-snug hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {headline}
        </Link>
        {analysis.summary && <p className="mt-1 line-clamp-2 text-sm text-muted">{analysis.summary}</p>}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <RelevanceVote itemId={item.id} current={r.vote} source="browse" />
            <FavoriteButton itemId={item.id} favorited={favorited} source="browse" size="sm" />
          </div>
          {status.hint && <span className="text-xs text-muted">{status.hint}</span>}
        </div>
      </div>
    </Card>
  );
}
