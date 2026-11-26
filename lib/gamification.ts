/**
 * Points, badges and streaks. Pure functions so they are easy to test;
 * the server applies the results with the service role (see lib/actions.ts).
 * Points reward participation only, never which side a user takes.
 */

export type ActionType = "read" | "emailed" | "called" | "commented" | "signed" | "attended" | "shared";
export type Level = "city" | "county" | "state" | "federal";
export type ItemType = "bill" | "comment_period" | "hearing" | "vote" | "agenda_item" | "opportunity";

export const POINTS: Record<ActionType, number> = {
  read: 1,
  shared: 3,
  signed: 5,
  emailed: 10,
  called: 15,
  commented: 20,
  attended: 25,
};

/** Actions that count as making your voice heard (not just reading). */
export const VOICE_ACTIONS: ActionType[] = ["emailed", "called", "commented", "signed", "attended"];

export type ActionRecord = {
  type: ActionType;
  created_at: string;
  item_id: string | null;
  item_level: Level | null;
  item_type: ItemType | null;
  item_topics: string[];
};

export type BadgeDef = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  earned: (ctx: BadgeContext) => boolean;
};

export type BadgeContext = {
  actions: ActionRecord[];
  petTopics: string[];
  now: Date;
};

const voice = (a: ActionRecord) => VOICE_ACTIONS.includes(a.type);
const distinctItems = (as: ActionRecord[]) => new Set(as.map((a) => a.item_id).filter(Boolean)).size;

export const BADGES: BadgeDef[] = [
  {
    slug: "first-contact",
    name: "First Contact",
    description: "Contacted an elected official or submitted a comment for the first time.",
    icon: "📣",
    earned: ({ actions }) => actions.some(voice),
  },
  {
    slug: "well-informed",
    name: "Well Informed",
    description: "Read 20 issue summaries.",
    icon: "📚",
    earned: ({ actions }) => distinctItems(actions.filter((a) => a.type === "read")) >= 20,
  },
  {
    slug: "comment-champion",
    name: "Comment Champion",
    description: "Submitted public comments on 5 comment periods.",
    icon: "📝",
    earned: ({ actions }) =>
      distinctItems(actions.filter((a) => a.type === "commented" && a.item_type === "comment_period")) >= 5,
  },
  {
    slug: "all-three-levels",
    name: "All Three Levels",
    description: "Spoke up on a local, a state and a federal issue.",
    icon: "🏛️",
    earned: ({ actions }) => {
      const levels = new Set(actions.filter(voice).map((a) => (a.item_level === "county" ? "city" : a.item_level)));
      return levels.has("city") && levels.has("state") && levels.has("federal");
    },
  },
  {
    slug: "pet-issue-guardian",
    name: "Pet-Issue Guardian",
    description: "Took action on 3 items about one of your pet issues.",
    icon: "🛡️",
    earned: ({ actions, petTopics }) =>
      petTopics.length > 0 &&
      distinctItems(actions.filter((a) => voice(a) && a.item_topics.some((t) => petTopics.includes(t)))) >= 3,
  },
  {
    slug: "steady-voice",
    name: "Steady Voice",
    description: "Took action 4 weeks in a row.",
    icon: "🔥",
    earned: ({ actions, now }) => weeklyStreak(actions, now) >= 4,
  },
];

/** Monday-based week index (UTC), so streaks don't depend on server timezone. */
export function weekIndex(d: Date): number {
  const days = Math.floor(d.getTime() / 86_400_000);
  // 1970-01-01 was a Thursday; shift so weeks start Monday.
  return Math.floor((days + 3) / 7);
}

/**
 * Consecutive weeks (ending this week or last week) with at least one voice action.
 * Last week still counts so a streak isn't "broken" on Monday morning.
 */
export function weeklyStreak(actions: Pick<ActionRecord, "type" | "created_at">[], now: Date): number {
  const weeks = new Set(
    actions.filter((a) => VOICE_ACTIONS.includes(a.type)).map((a) => weekIndex(new Date(a.created_at))),
  );
  let w = weekIndex(now);
  if (!weeks.has(w)) w -= 1;
  let streak = 0;
  while (weeks.has(w)) {
    streak++;
    w--;
  }
  return streak;
}

export type BadgeProgress = { current: number; target: number; unit: string };

export function badgeProgress(slug: string, ctx: BadgeContext): BadgeProgress {
  switch (slug) {
    case "first-contact":
      return { current: ctx.actions.some(voice) ? 1 : 0, target: 1, unit: "action" };
    case "well-informed":
      return { current: Math.min(20, distinctItems(ctx.actions.filter((a) => a.type === "read"))), target: 20, unit: "summaries read" };
    case "comment-champion":
      return {
        current: Math.min(5, distinctItems(ctx.actions.filter((a) => a.type === "commented" && a.item_type === "comment_period"))),
        target: 5,
        unit: "comments",
      };
    case "all-three-levels": {
      const levels = new Set(
        ctx.actions
          .filter(voice)
          .map((a) => (a.item_level === "county" ? "city" : a.item_level))
          .filter((l): l is "city" | "state" | "federal" => l === "city" || l === "state" || l === "federal"),
      );
      return { current: levels.size, target: 3, unit: "levels" };
    }
    case "pet-issue-guardian":
      return {
        current: ctx.petTopics.length
          ? Math.min(3, distinctItems(ctx.actions.filter((a) => voice(a) && a.item_topics.some((t) => ctx.petTopics.includes(t)))))
          : 0,
        target: 3,
        unit: "actions",
      };
    case "steady-voice":
      return { current: Math.min(4, weeklyStreak(ctx.actions, ctx.now)), target: 4, unit: "weeks" };
    default:
      return { current: 0, target: 1, unit: "goal" };
  }
}

export function newlyEarnedBadges(ctx: BadgeContext, alreadyHave: string[]): BadgeDef[] {
  const have = new Set(alreadyHave);
  return BADGES.filter((b) => !have.has(b.slug) && b.earned(ctx));
}

export function levelForPoints(points: number): { level: number; title: string; current: number; next: number | null } {
  const tiers = [
    { at: 0, title: "Newcomer" },
    { at: 25, title: "Engaged Neighbor" },
    { at: 100, title: "Active Citizen" },
    { at: 250, title: "Community Advocate" },
    { at: 600, title: "Civic Champion" },
  ];
  let i = 0;
  while (i + 1 < tiers.length && points >= tiers[i + 1].at) i++;
  return { level: i + 1, title: tiers[i].title, current: tiers[i].at, next: tiers[i + 1]?.at ?? null };
}
