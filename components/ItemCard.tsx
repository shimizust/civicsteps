import Link from "next/link";
import { Bookmark, Check, ChevronRight, Clock, MapPin, PenLine, Star } from "lucide-react";
import type { Ranked } from "@/lib/relevance";
import { hasDirection } from "@/lib/impact";
import type { Database } from "@/lib/supabase/database.types";
import type { Place } from "@/lib/data";
import { formatMiles } from "@/lib/locations";
import { Card, Kicker, LEVEL_LABEL, Pill, cx, deadlineLabel } from "@/components/ui";
import { TopicTile } from "@/components/TopicTile";
import { ImpactBadge, ImpactChip } from "@/components/ImpactMeter";
import { RepAvatars } from "@/components/RepAvatars";
import { RelevanceVote } from "@/components/RelevanceVote";
import { FavoriteButton } from "@/components/FavoriteButton";
import { enactmentDate } from "@/lib/enactment";

type Official = Database["public"]["Tables"]["officials"]["Row"];

export const TYPE_LABEL: Record<string, string> = {
  bill: "Bill",
  comment_period: "Public comment",
  hearing: "Hearing",
  vote: "Vote",
  agenda_item: "Council agenda",
  opportunity: "Opportunity",
};

export const typeLabel = (item: { type: string; enacted_at?: string | null }) =>
  item.enacted_at ? `Enacted on ${enactmentDate(item.enacted_at)}` : (TYPE_LABEL[item.type] ?? item.type);

export function ItemCard({
  r,
  reps = [],
  variant = "default",
  place,
  showVote = false,
  onVote,
  showFavorite = false,
  favoriteSource = "feed",
  onFavorite,
  updateSummary,
}: {
  r: Ranked;
  reps?: Official[];
  variant?: "default" | "hero" | "compact";
  place?: Place;
  showVote?: boolean;
  onVote?: (itemId: string, value: boolean | null) => void;
  showFavorite?: boolean;
  favoriteSource?: "feed" | "browse" | "item" | "favorites";
  onFavorite?: (itemId: string, favorited: boolean) => void;
  updateSummary?: string | null;
}) {
  const { item, analysis, impact } = r;
  const headline = analysis.headline?.trim() || item.title;
  const showTitle = headline !== item.title;
  const summary = analysis.summary && !item.title.includes(analysis.summary.slice(0, 60)) ? analysis.summary : null;
  const open = r.daysLeft !== null && r.daysLeft >= 0;
  const urgent = open && r.daysLeft! <= 7;
  const label = open ? deadlineLabel(r.daysLeft, item.comment_deadline ? "comment" : "event") : null;
  const hero = variant === "hero";
  const facets = impact.facets.filter((f) => f.magnitude > 0).slice(0, hero ? 4 : 3);
  const showDir = hasDirection(impact);

  if (variant === "compact") {
    return (
      <Link
        href={`/items/${item.id}`}
        className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Card className="flex items-center gap-3 !p-3 transition group-hover:border-accent group-hover:shadow-[var(--shadow-card-hover)]">
          <TopicTile topics={analysis.topics} size="sm" />
          <p className="min-w-0 flex-1 truncate font-medium group-hover:text-accent">{headline}</p>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-benefit">
            <Check className="h-4 w-4" aria-hidden /> You acted
          </span>
        </Card>
      </Link>
    );
  }

  return (
    <Card
      className={cx(
        "group relative flex h-full gap-3.5 transition duration-150 hover:-translate-y-0.5 hover:border-accent hover:shadow-[var(--shadow-card-hover)] sm:gap-4",
        r.favorited ? "border-favorite/45" : r.petMatch && "border-pet/40",
        hero && "sm:p-6",
      )}
    >
      <TopicTile topics={analysis.topics} pet={r.petMatch} size={hero ? "lg" : "md"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <Kicker className="tabular-nums">
            {LEVEL_LABEL[item.level]} · {typeLabel(item)}
          </Kicker>
          {r.favorited && (
            <Pill tone="favorite">
              <Bookmark className="h-3 w-3 fill-current" aria-hidden /> Favorited
            </Pill>
          )}
          {updateSummary && <Pill tone="accent">Updated</Pill>}
          {r.favorited && r.acted && (
            <Pill tone="benefit">
              <Check className="h-3 w-3" aria-hidden /> You acted
            </Pill>
          )}
          {r.petMatch && hero && (
            <Pill tone="pet">
              <Star className="h-3 w-3 fill-current" aria-hidden /> Pet issue
            </Pill>
          )}
          {label && (
            <Pill tone={urgent ? "urgent" : "accent"} className="tabular-nums">
              <Clock className="h-3 w-3" aria-hidden />
              {label}
            </Pill>
          )}
          {place && (
            <span title={`${place.address}, measured from the middle of your ZIP`}>
              <Pill tone="neutral" className="tabular-nums">
                <MapPin className="h-3 w-3" aria-hidden />
                {formatMiles(place.miles)} from you
              </Pill>
            </span>
          )}
        </div>

        <h3
          className={cx("mt-2 line-clamp-3 font-display font-semibold leading-snug tracking-tight", hero ? "text-xl sm:text-2xl" : "text-lg")}
          title={showTitle ? undefined : item.title}
        >
          <Link
            href={`/items/${item.id}`}
            className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent group-hover:text-accent"
          >
            {headline}
          </Link>
        </h3>
        {showTitle && <p className="mt-0.5 truncate text-xs text-muted" title={item.title}>{item.title}</p>}
        {summary && <p className={cx("mt-2 text-sm leading-relaxed text-muted", hero ? "line-clamp-3" : "line-clamp-2")}>{summary}</p>}
        {updateSummary && (
          <p className="mt-2 rounded-lg bg-favorite-soft/70 px-2.5 py-1.5 text-xs font-medium text-favorite">
            {updateSummary}
          </p>
        )}

        {(facets.length > 0 || impact.level) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {facets.map((f) => <ImpactChip key={f.facet} f={f} showDirection={showDir} />)}
            <span className="ml-auto pl-2"><ImpactBadge impact={impact} /></span>
          </div>
        )}
        {!facets.length && r.reasons.length > 0 && (
          <p className="mt-2 text-xs text-muted">Why you&apos;re seeing this: {r.reasons.slice(0, 3).join(" · ")}</p>
        )}

        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3">
            <RepAvatars officials={reps} />
            <div className="relative z-10 ml-auto flex items-center gap-2">
              {showFavorite && (
                <FavoriteButton
                  itemId={item.id}
                  favorited={r.favorited}
                  source={favoriteSource}
                  compact
                  onChange={(v) => onFavorite?.(item.id, v)}
                />
              )}
              {showVote && (
                <RelevanceVote
                  itemId={item.id}
                  current={r.vote}
                  source="feed"
                  compact
                  onVote={(v) => onVote?.(item.id, v)}
                />
              )}
              {(hero || item.type === "comment_period") && open && (
                <Link
                  href={`/draft/${item.id}${item.type === "comment_period" ? "?kind=public_comment" : ""}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:text-paper"
                >
                  <PenLine className="h-3.5 w-3.5" aria-hidden />
                  {item.type === "comment_period" ? "Draft comment" : "Speak up"}
                </Link>
              )}
              <span className="pointer-events-none inline-flex shrink-0 items-center text-sm font-medium text-accent" aria-hidden>
                Details
                <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
