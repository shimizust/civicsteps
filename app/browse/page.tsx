import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { BROWSE_PAGE_SIZE, browseItems, getFeed, getIndexCounts, getProfile, type BrowseRow } from "@/lib/data";
import { feedStatus, type Feed, type FeedStatus } from "@/lib/relevance";
import { TYPE_LABEL } from "@/components/ItemCard";
import { TopicTile } from "@/components/TopicTile";
import { RelevanceVote } from "@/components/RelevanceVote";
import { Card, Empty, LEVEL_LABEL, LinkButton, PageTitle, Pill } from "@/components/ui";

const LEVELS = ["all", "city", "state", "federal"] as const;

const STATUS: Record<FeedStatus, { label: string; tone: "accent" | "neutral" | "urgent"; hint?: string }> = {
  in_feed: { label: "In your feed", tone: "accent" },
  acted: { label: "You acted", tone: "accent" },
  not_relevant: { label: "Hidden: you marked not relevant", tone: "urgent" },
  outside_area: { label: "Outside your area", tone: "neutral", hint: "Not for where you live, so it can't reach your feed" },
  inactive: { label: "No recent activity", tone: "neutral", hint: "No deadline ahead and no action in the last 45 days" },
  ranked_lower: { label: "Matched, ranked lower", tone: "neutral", hint: "Relevant, but your feed shows the top 15 per section" },
  no_match: { label: "Not matched to you", tone: "neutral", hint: "Didn't hit your interests, reps or groups. Mark it relevant if it should" },
};

type Params = { q?: string; level?: string; scope?: string; page?: string };

export default async function BrowsePage({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/browse");
  const profile = await getProfile(supabase, user.id);
  if (!profile?.onboarded_at) redirect("/onboarding");

  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 200) ?? "";
  const level = LEVELS.includes(sp.level as (typeof LEVELS)[number]) && sp.level !== "all" ? sp.level! : null;
  const scope = sp.scope === "all" ? "all" : "area";
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);

  const [{ rows, total }, feed, counts] = await Promise.all([
    browseItems(supabase, { query: q, level, scope, page }),
    getFeed(supabase, user.id),
    getIndexCounts(supabase),
  ]);

  const href = (over: Partial<Params>) => {
    const next = { q: q || undefined, level: level ?? undefined, scope: scope === "all" ? "all" : undefined, page: undefined, ...over };
    const qs = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1]));
    return qs.size ? `/browse?${qs}` : "/browse";
  };
  const pages = Math.ceil(total / BROWSE_PAGE_SIZE);

  return (
    <div>
      <PageTitle sub="Everything we've indexed, including items your feed filtered out. Marking items relevant or not tunes your feed.">
        Browse all items
      </PageTitle>

      <form action="/browse" className="flex gap-2" role="search">
        {level && <input type="hidden" name="level" value={level} />}
        {scope === "all" && <input type="hidden" name="scope" value="all" />}
        <label className="relative flex-1">
          <span className="sr-only">Search items</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search titles and summaries, e.g. national parks, rent, BART"
            className="w-full rounded-lg border border-line bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
          />
        </label>
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 dark:text-paper">
          Search
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <nav className="flex flex-wrap gap-1.5" aria-label="Filter by level">
          {LEVELS.map((l) => (
            <LinkButton
              key={l}
              href={href({ level: l === "all" ? undefined : l })}
              variant={(level ?? "all") === l ? "primary" : "secondary"}
              className="px-3 py-1.5 capitalize"
            >
              {l === "all" ? "All levels" : l}
            </LinkButton>
          ))}
        </nav>
        <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" aria-hidden />
        <nav className="flex gap-1.5" aria-label="Filter by area">
          <LinkButton href={href({ scope: undefined })} variant={scope === "area" ? "primary" : "secondary"} className="px-3 py-1.5">
            Your area ({counts.inArea})
          </LinkButton>
          <LinkButton href={href({ scope: "all" })} variant={scope === "all" ? "primary" : "secondary"} className="px-3 py-1.5">
            Everywhere ({counts.indexed})
          </LinkButton>
        </nav>
      </div>

      <p className="mb-3 mt-6 text-sm text-muted">
        {total} {total === 1 ? "item" : "items"}
        {q && <> matching &ldquo;{q}&rdquo;</>}
        {pages > 1 && ` · page ${page + 1} of ${pages}`}
      </p>

      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.item.id}>
              <Row r={r} feed={feed} />
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

function Row({ r, feed }: { r: BrowseRow; feed: Feed }) {
  const { item, analysis } = r;
  const headline = analysis.headline?.trim() || item.title;
  const status = STATUS[feedStatus(item.id, r, feed)];
  return (
    <Card className="flex gap-3 !p-3 sm:!p-4">
      <TopicTile topics={analysis.topics} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Pill>{LEVEL_LABEL[item.level]}</Pill>
          <Pill>{TYPE_LABEL[item.type] ?? item.type}</Pill>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
        <Link href={`/items/${item.id}`} className="mt-1.5 block font-medium leading-snug hover:text-accent">
          {headline}
        </Link>
        {analysis.summary && <p className="mt-1 line-clamp-2 text-sm text-muted">{analysis.summary}</p>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <RelevanceVote itemId={item.id} current={r.vote} source="browse" />
          {status.hint && <span className="text-xs text-muted">{status.hint}</span>}
        </div>
      </div>
    </Card>
  );
}
