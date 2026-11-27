import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { getFavoritedItems, getProfile } from "@/lib/data";
import { needsAttention } from "@/lib/favorites";
import { FEED_LEVELS, matchesLevel, type FeedLevel } from "@/lib/relevance";
import { FavoritesList } from "@/components/FavoritesList";
import { Empty, PageTitle, cx } from "@/components/ui";

export default async function FavoritesPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/favorites");
  const profile = await getProfile(supabase, user.id);
  if (!profile?.onboarded_at) redirect("/onboarding");

  const sp = await searchParams;
  const level = FEED_LEVELS.includes(sp.level as FeedLevel) ? (sp.level as FeedLevel) : "all";
  const { entries, totalCount, updatedCount } = await getFavoritedItems(supabase, user.id);

  const levelCounts: Record<FeedLevel, number> = {
    all: entries.length,
    city: entries.filter((e) => matchesLevel(e.item, "city")).length,
    state: entries.filter((e) => matchesLevel(e.item, "state")).length,
    federal: entries.filter((e) => matchesLevel(e.item, "federal")).length,
  };
  const filtered = entries.filter((e) => matchesLevel(e.item, level));
  const attention = filtered.filter((e) => needsAttention(e));
  const rest = filtered.filter((e) => !needsAttention(e));

  const sub =
    totalCount > 0
      ? `Tracking ${totalCount} ${totalCount === 1 ? "issue" : "issues"}${updatedCount > 0 ? ` · ${updatedCount} updated since you last checked` : ""}.`
      : "Save important issues to track status updates, new deadlines, and follow-up actions.";

  return (
    <div>
      <PageTitle sub={sub}>Your favorites</PageTitle>

      {totalCount > 0 && (
        <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Filter favorites by level">
          {FEED_LEVELS.map((l) => {
            const active = l === level;
            return (
              <Link
                key={l}
                href={l === "all" ? "/favorites" : `/favorites?level=${l}`}
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
      )}

      {totalCount === 0 ? (
        <Empty>
          <div className="mx-auto max-w-md space-y-3 py-2">
            <Bookmark className="mx-auto h-7 w-7 text-favorite" aria-hidden />
            <p className="font-medium text-ink">No favorited issues yet</p>
            <p className="leading-relaxed">
              Use <strong className="font-medium text-ink">Relevant</strong> to tune what shows up in your feed, and use{" "}
              <strong className="font-medium text-ink">Favorite</strong> on bills or hearings you want to keep checking back on.
              We&apos;ll watch for status updates and alert you before deadlines.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-1">
              <Link className="font-medium text-accent underline" href="/feed">
                Explore your feed
              </Link>
              <Link className="font-medium text-accent underline" href="/browse">
                Browse all items
              </Link>
            </div>
          </div>
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty>
          No favorited {level} issues yet.{" "}
          <Link className="text-accent underline" href="/favorites">
            Show all favorites
          </Link>
        </Empty>
      ) : (
        <FavoritesList attention={attention} rest={rest} />
      )}
    </div>
  );
}
