/** Server-side data loaders shared by pages. All take a user-scoped Supabase client (RLS applies). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { buildFeed, learnTopicAffinity, type Candidate, type FeedAnalysis, type FeedItem, type Interest } from "@/lib/relevance";
import { groupsForDemographics, type Demographics } from "@/lib/taxonomy";
import type { Answers, Fact, Registry } from "@/lib/facts";
import type { ImpactInput } from "@/lib/impact";
import { levelForPoints, weeklyStreak, VOICE_ACTIONS, type ActionType } from "@/lib/gamification";

type DB = SupabaseClient<Database>;

export async function getProfile(db: DB, userId: string) {
  const { data } = await db.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  return data;
}

/** Labels of the user's areas whose recent items are still being pulled in (see lib/coverage.ts). */
export async function pendingAreas(db: DB, areas: { scope: string; label: string }[]): Promise<string[]> {
  if (!areas.length) return [];
  const { data, error } = await db.from("ingest_coverage").select("scope, backfilled_at").in("scope", areas.map((a) => a.scope));
  if (error) return [];
  const done = new Set(data.filter((r) => r.backfilled_at).map((r) => r.scope));
  return areas.filter((a) => !done.has(a.scope)).map((a) => a.label);
}

export async function getInterests(db: DB, userId: string): Promise<(Interest & { id: string })[]> {
  const { data } = await db.from("user_interests").select("id, label, topic_slugs, keywords, is_pet").eq("user_id", userId).order("created_at");
  return data ?? [];
}

export async function getAnswers(db: DB, userId: string): Promise<Answers> {
  const { data } = await db.from("user_facts").select("fact_key, value").eq("user_id", userId);
  return Object.fromEntries((data ?? []).map((r) => [r.fact_key, r.value]));
}

/** Registry entries for these keys, plus whatever they were merged into. */
export async function getRegistry(db: DB, keys: Iterable<string>): Promise<Registry> {
  const registry: Registry = new Map();
  let want = [...new Set(keys)];
  for (let hop = 0; hop < 3 && want.length; hop++) {
    const found: Fact[] = [];
    // Chunked: keys go in the query string.
    for (let i = 0; i < want.length; i += 150) {
      const { data } = await db
        .from("facts")
        .select("key, question, you_phrase, answer_type, options, topics, facets, canonical_key")
        .in("key", want.slice(i, i + 150));
      found.push(...((data ?? []) as Fact[]));
    }
    for (const f of found) registry.set(f.key, f);
    want = [...new Set(found.map((f) => f.canonical_key).filter((k): k is string => !!k && !registry.has(k)))];
  }
  return registry;
}

export const factKeysOf = (impacts: ImpactInput[] | null | undefined) =>
  (impacts ?? []).flatMap((i) => (i.applies_if?.fact_key ? [i.applies_if.fact_key] : []));

/** The parts of a user's profile that relevance and impact scoring use. */
export async function getUserContext(db: DB, userId: string) {
  const [profile, interests, answers] = await Promise.all([getProfile(db, userId), getInterests(db, userId), getAnswers(db, userId)]);
  const demographics = (profile?.demographics ?? {}) as Demographics;
  return {
    profile,
    interests,
    demographics,
    answers,
    groups: groupsForDemographics(demographics),
  };
}

/** The user's "is this relevant?" votes, and the per-topic lean learned from them. */
export async function getVotes(db: DB, userId: string) {
  const { data } = await db.from("item_feedback").select("item_id, relevant").eq("user_id", userId);
  const votes = new Map((data ?? []).map((v) => [v.item_id, v.relevant]));
  const ids = [...votes.keys()];
  const topics = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data: rows } = await db.from("item_analysis").select("item_id, topics").in("item_id", ids.slice(i, i + 150));
    for (const r of rows ?? []) topics.set(r.item_id, r.topics);
  }
  const affinity = learnTopicAffinity(ids.map((id) => ({ relevant: votes.get(id)!, topics: topics.get(id) ?? [] })));
  return { votes, affinity };
}

export async function getFeed(db: DB, userId: string) {
  const [{ profile, interests, groups, demographics, answers }, candidatesRes, actionsRes, { votes, affinity }] = await Promise.all([
    getUserContext(db, userId),
    db.rpc("feed_candidates", { p_limit: 400 }),
    db.from("user_actions").select("item_id, type").eq("user_id", userId),
    getVotes(db, userId),
  ]);
  if (candidatesRes.error) throw candidatesRes.error;
  const acted = new Set(
    (actionsRes.data ?? []).filter((a) => a.item_id && VOICE_ACTIONS.includes(a.type as ActionType)).map((a) => a.item_id!),
  );
  const candidates = (candidatesRes.data ?? []) as unknown as Candidate[];
  const registry = await getRegistry(db, candidates.flatMap((c) => factKeysOf(c.analysis.impacts)));
  return buildFeed(candidates, {
    interests,
    groups,
    demographics,
    answers,
    registry,
    jurisdictionIds: profile?.jurisdiction_ids ?? [],
    actedItemIds: acted,
    votes,
    affinity,
    now: new Date(),
  });
}

/** How much is indexed, and how much of it is in the user's area and still active. */
export async function getIndexCounts(db: DB) {
  const { data } = await db.rpc("index_counts");
  const row = data?.[0];
  return { indexed: row?.indexed ?? 0, inArea: row?.in_area ?? 0, inAreaActive: row?.in_area_active ?? 0 };
}

export const BROWSE_PAGE_SIZE = 30;

export type BrowseRow = {
  item: FeedItem;
  analysis: FeedAnalysis;
  my_official_ids: string[];
  inArea: boolean;
  active: boolean;
  vote: boolean | null;
};

/** Every indexed item, searchable, for the Browse page. */
export async function browseItems(
  db: DB,
  opts: { query?: string; level?: string | null; scope?: "area" | "all"; page?: number },
): Promise<{ rows: BrowseRow[]; total: number }> {
  const page = Math.max(0, opts.page ?? 0);
  const { data, error } = await db.rpc("browse_items", {
    p_query: opts.query?.trim() || undefined,
    p_level: opts.level ?? undefined,
    p_scope: opts.scope ?? "area",
    p_limit: BROWSE_PAGE_SIZE,
    p_offset: page * BROWSE_PAGE_SIZE,
  });
  if (error) throw error;
  return {
    total: data?.[0]?.total_count ?? 0,
    rows: (data ?? []).map((r) => ({
      item: r.item as unknown as FeedItem,
      analysis: r.analysis as unknown as FeedAnalysis,
      my_official_ids: r.my_official_ids ?? [],
      inArea: r.in_area,
      active: r.active,
      vote: r.relevant ?? null,
    })),
  };
}

export async function getMyOfficials(db: DB, userId: string) {
  const { data } = await db
    .from("user_officials")
    .select("officials(*)")
    .eq("user_id", userId);
  const order = { city: 0, county: 1, state: 2, federal: 3 } as const;
  return (data ?? [])
    .map((r) => r.officials)
    .filter((o): o is NonNullable<typeof o> => !!o)
    .sort((a, b) => order[a.level] - order[b.level] || a.office.localeCompare(b.office) || a.name.localeCompare(b.name));
}

export async function getItem(db: DB, id: string) {
  const { data } = await db
    .from("items")
    .select("*, item_analysis(*), item_officials(role, vote, officials(*))")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function getStats(db: DB, userId: string) {
  const [points, badges, allBadges, actions] = await Promise.all([
    db.from("points_ledger").select("points").eq("user_id", userId),
    db.from("user_badges").select("badge_slug, awarded_at").eq("user_id", userId),
    db.from("badges").select("*").order("slug"),
    db.from("user_actions").select("type, created_at").eq("user_id", userId),
  ]);
  const total = (points.data ?? []).reduce((s, p) => s + p.points, 0);
  const earned = new Map((badges.data ?? []).map((b) => [b.badge_slug, b.awarded_at]));
  const acts = (actions.data ?? []) as { type: ActionType; created_at: string }[];
  return {
    points: total,
    level: levelForPoints(total),
    streak: weeklyStreak(acts, new Date()),
    voiceCount: acts.filter((a) => VOICE_ACTIONS.includes(a.type)).length,
    badges: (allBadges.data ?? []).map((b) => ({ ...b, awarded_at: earned.get(b.slug) ?? null })),
  };
}
