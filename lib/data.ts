/** Server-side data loaders shared by pages. All take a user-scoped Supabase client (RLS applies). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { buildFeed, deadlineOf, learnTopicAffinity, matchInterests, type Candidate, type FeedAnalysis, type FeedItem, type Interest } from "@/lib/relevance";
import { expandTopics, groupsForDemographics, type Demographics } from "@/lib/taxonomy";
import type { Answers, Fact, Registry } from "@/lib/facts";
import { personalImpact, type ImpactInput, type PersonalImpact } from "@/lib/impact";
import { badgeProgress, levelForPoints, weeklyStreak, VOICE_ACTIONS, type ActionRecord, type ActionType, type ItemType, type Level } from "@/lib/gamification";
import { favoriteUpdate, sortFavorites, type FavoriteRecord, type FavoriteUpdate } from "@/lib/favorites";
import { nearest, type Point } from "@/lib/locations";

/** The nearest site an item names, for the "1.2 mi from you" chip. */
export type Place = { address: string; miles: number; count: number };

type DB = SupabaseClient<Database>;

export async function getProfile(db: DB, userId: string) {
  const { data } = await db.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  return data;
}

type CoverageRow = Pick<Database["public"]["Tables"]["ingest_coverage"]["Row"],
  "backfilled_at" | "progress" | "progress_at" | "items_found" | "items_analyzed" | "items_failed">;

export type AreaProgress = CoverageRow & { scope: string; label: string };

export async function getAreaProgress(db: DB, areas: { scope: string; label: string }[]): Promise<AreaProgress[] | null> {
  if (!areas.length) return [];
  const { data, error } = await db.from("ingest_coverage")
    .select("scope, backfilled_at, progress, progress_at, items_found, items_analyzed, items_failed")
    .in("scope", areas.map((a) => a.scope));
  if (error) {
    console.error("coverage progress lookup failed", error.message);
    return null;
  }
  const rows = new Map(data.map((r) => [r.scope, r]));
  return areas.map((area) => ({
    backfilled_at: null, progress: null, progress_at: null, items_found: null, items_analyzed: null, items_failed: null,
    ...rows.get(area.scope),
    ...area,
  }));
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
        .select("key, question, help_text, you_phrase, answer_type, options, topics, facets, canonical_key")
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

export async function getFavorites(db: DB, userId: string): Promise<FavoriteRecord[]> {
  const { data } = await db
    .from("item_favorites")
    .select("item_id, created_at, last_seen_at, last_seen_status, last_seen_action, last_seen_action_at, last_seen_enacted_at, last_seen_deadline")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getFavoriteIds(db: DB, userId: string): Promise<Set<string>> {
  const { data } = await db.from("item_favorites").select("item_id").eq("user_id", userId);
  return new Set((data ?? []).map((r) => r.item_id));
}

async function topicAffinityFromVotes(db: DB, votes: Map<string, boolean>, extraPositiveIds: Iterable<string> = []) {
  const extra = [...new Set(extraPositiveIds)].filter((id) => !votes.has(id));
  const ids = [...votes.keys(), ...extra];
  const topics = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data: rows } = await db.from("item_analysis").select("item_id, topics").in("item_id", ids.slice(i, i + 150));
    for (const r of rows ?? []) topics.set(r.item_id, r.topics);
  }
  return learnTopicAffinity([
    ...[...votes.keys()].map((id) => ({ relevant: votes.get(id)!, topics: topics.get(id) ?? [] })),
    ...extra.map((id) => ({ relevant: true, topics: topics.get(id) ?? [] })),
  ]);
}

/** The user's "is this relevant?" votes, and the per-topic lean learned from them (plus favorited items). */
export async function getVotes(db: DB, userId: string, extraPositiveIds: Iterable<string> = []) {
  const { data } = await db.from("item_feedback").select("item_id, relevant").eq("user_id", userId);
  const votes = new Map((data ?? []).map((v) => [v.item_id, v.relevant]));
  const affinity = await topicAffinityFromVotes(db, votes, extraPositiveIds);
  return { votes, affinity };
}

/** For each item that names street addresses, the one nearest the user's ZIP and how far it is. */
export async function nearestPlaces(db: DB, home: Point | null, itemIds: string[]): Promise<Record<string, Place>> {
  const out: Record<string, Place> = {};
  if (!home || !itemIds.length) return out;
  const byItem = new Map<string, { address: string; lat: number; lng: number }[]>();
  for (let i = 0; i < itemIds.length; i += 100) {
    const { data } = await db.from("item_locations").select("item_id, address, lat, lng").in("item_id", itemIds.slice(i, i + 100));
    for (const l of data ?? []) byItem.set(l.item_id, [...(byItem.get(l.item_id) ?? []), l]);
  }
  for (const [id, places] of byItem) {
    const n = nearest(home, places);
    if (n) out[id] = { address: n.address, miles: n.miles, count: places.length };
  }
  return out;
}

export async function getFeed(db: DB, userId: string) {
  const [{ profile, interests, groups, demographics, answers }, candidatesRes, actionsRes, feedbackRes, favorites] = await Promise.all([
    getUserContext(db, userId),
    db.rpc("feed_candidates", { p_limit: 400 }),
    db.from("user_actions").select("item_id, type").eq("user_id", userId),
    db.from("item_feedback").select("item_id, relevant").eq("user_id", userId),
    getFavorites(db, userId),
  ]);
  if (candidatesRes.error) throw candidatesRes.error;
  const acted = new Set(
    (actionsRes.data ?? []).filter((a) => a.item_id && VOICE_ACTIONS.includes(a.type as ActionType)).map((a) => a.item_id!),
  );
  const votes = new Map((feedbackRes.data ?? []).map((v) => [v.item_id, v.relevant]));
  const favoriteMap = new Map(favorites.map((f) => [f.item_id, f]));
  const favoritedIds = new Set(favoriteMap.keys());
  const candidates = (candidatesRes.data ?? []) as unknown as Candidate[];
  const [registry, affinity] = await Promise.all([
    getRegistry(db, candidates.flatMap((c) => factKeysOf(c.analysis.impacts))),
    topicAffinityFromVotes(db, votes, favoritedIds),
  ]);
  const feed = buildFeed(candidates, {
    interests,
    groups,
    demographics,
    answers,
    registry,
    jurisdictionIds: profile?.jurisdiction_ids ?? [],
    actedItemIds: acted,
    votes,
    favoritedIds,
    affinity,
    now: new Date(),
  });
  const favoriteUpdates: Record<string, string> = {};
  for (const r of feed.ranked) {
    const fav = favoriteMap.get(r.item.id);
    if (!fav) continue;
    const upd = favoriteUpdate(r.item, fav);
    if (upd.changed && upd.summary) favoriteUpdates[r.item.id] = upd.summary;
  }
  const home = profile?.lat != null && profile?.lng != null ? { lat: profile.lat, lng: profile.lng } : null;
  const shown = feed.ranked
    .filter((r) => (!r.acted || r.favorited) && (r.item.level === "city" || r.item.level === "county"))
    .map((r) => r.item.id);
  return {
    ...feed,
    places: await nearestPlaces(db, home, shown),
    favoriteUpdates,
    favoriteCount: favorites.length,
  };
}

type OfficialRow = Database["public"]["Tables"]["officials"]["Row"];
export type LoggedAction = { type: ActionType; created_at: string };

export type FavoritedEntry = {
  item: FeedItem;
  analysis: FeedAnalysis;
  favoritedAt: string;
  lastSeenAt: string;
  update: FavoriteUpdate;
  deadline: Date | null;
  daysLeft: number | null;
  petMatch: boolean;
  impact: PersonalImpact;
  reps: OfficialRow[];
  place?: Place;
  actions: LoggedAction[];
};

const EMPTY_ANALYSIS: FeedAnalysis = {
  headline: null,
  impacts: [],
  summary: "",
  why_it_matters: null,
  topics: [],
  affected_groups: [],
  keywords: [],
  significance: 3,
};

/** All issues the user favorited to keep following up on, sorted by updates and urgency. */
export async function getFavoritedItems(db: DB, userId: string): Promise<{
  entries: FavoritedEntry[];
  totalCount: number;
  updatedCount: number;
}> {
  const [favRes, ctx, myOfficials, actionsRes] = await Promise.all([
    db
      .from("item_favorites")
      .select(
        "item_id, created_at, last_seen_at, last_seen_status, last_seen_action, last_seen_action_at, last_seen_enacted_at, last_seen_deadline, items(*, item_analysis(*), item_officials(role, vote, officials(*)), item_locations(address, lat, lng))",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    getUserContext(db, userId),
    getMyOfficials(db, userId),
    db.from("user_actions").select("item_id, type, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);
  if (favRes.error) throw favRes.error;

  const rows = (favRes.data ?? []).filter((r): r is typeof r & { items: NonNullable<typeof r.items> } => !!r.items);
  const impactKeys = rows.flatMap((r) => factKeysOf((r.items.item_analysis as unknown as FeedAnalysis | null)?.impacts));
  const registry = await getRegistry(db, impactKeys);

  const myOfficialIds = new Set(myOfficials.map((o) => o.id));
  const home = ctx.profile?.lat != null && ctx.profile?.lng != null ? { lat: ctx.profile.lat, lng: ctx.profile.lng } : null;
  const actionsByItem = new Map<string, LoggedAction[]>();
  for (const a of actionsRes.data ?? []) {
    if (!a.item_id || a.type === "read") continue;
    const list = actionsByItem.get(a.item_id) ?? [];
    list.push({ type: a.type as ActionType, created_at: a.created_at });
    actionsByItem.set(a.item_id, list);
  }

  const nowMs = Date.now();
  const raw: FavoritedEntry[] = rows.map((row) => {
    const rawItem = row.items;
    const item = rawItem as unknown as FeedItem;
    const analysis = (rawItem.item_analysis as unknown as FeedAnalysis | null) ?? {
      ...EMPTY_ANALYSIS,
      summary: rawItem.description ?? "",
    };
    const matches = matchInterests({ item, analysis }, ctx.interests);
    const petMatch = matches.some((m) => m.interest.is_pet);
    const impact = personalImpact(analysis.impacts, {
      groups: ctx.groups,
      matched: matches.map((m) => m.interest),
      demographics: ctx.demographics,
      answers: ctx.answers,
      registry,
    });
    const deadline = deadlineOf(item);
    const daysLeft = deadline ? Math.ceil((deadline.getTime() - nowMs) / 86_400_000) : null;
    const update = favoriteUpdate(rawItem, row);

    const seenRepIds = new Set<string>();
    const reps: OfficialRow[] = [];
    for (const io of rawItem.item_officials ?? []) {
      const o = io.officials;
      if (o && myOfficialIds.has(o.id) && !seenRepIds.has(o.id)) {
        seenRepIds.add(o.id);
        reps.push(o);
      }
    }

    const locs = rawItem.item_locations ?? [];
    const near = home && locs.length ? nearest(home, locs) : null;
    const place = near ? { address: near.address, miles: near.miles, count: locs.length } : undefined;

    return {
      item,
      analysis,
      favoritedAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      update,
      deadline,
      daysLeft,
      petMatch,
      impact,
      reps,
      place,
      actions: actionsByItem.get(item.id) ?? [],
    };
  });

  const entries = sortFavorites(raw);
  return {
    entries,
    totalCount: entries.length,
    updatedCount: entries.filter((e) => e.update.changed).length,
  };
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

function mapBrowseRows(
  data: {
    item: unknown;
    analysis: unknown;
    my_official_ids: string[] | null;
    in_area: boolean;
    active: boolean;
    relevant: boolean | null;
  }[],
): BrowseRow[] {
  return data.map((r) => ({
    item: r.item as unknown as FeedItem,
    analysis: r.analysis as unknown as FeedAnalysis,
    my_official_ids: r.my_official_ids ?? [],
    inArea: r.in_area,
    active: r.active,
    vote: r.relevant ?? null,
  }));
}

/** Every indexed item, searchable, for the Browse page. */
export async function browseItems(
  db: DB,
  opts: { query?: string; level?: string | null; scope?: "area" | "all"; topic?: string | null; sort?: "recent" | "deadline"; page?: number },
): Promise<{ rows: BrowseRow[]; total: number }> {
  const page = Math.max(0, opts.page ?? 0);
  const needsClientFilterOrSort = !!opts.topic || opts.sort === "deadline";

  if (!needsClientFilterOrSort) {
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
      rows: mapBrowseRows(data ?? []),
    };
  }

  const first = await db.rpc("browse_items", {
    p_query: opts.query?.trim() || undefined,
    p_level: opts.level ?? undefined,
    p_scope: opts.scope ?? "area",
    p_limit: 100,
    p_offset: 0,
  });
  if (first.error) throw first.error;
  const totalCount = first.data?.[0]?.total_count ?? 0;
  const extraOffsets = [100, 200].filter((off) => totalCount > off);
  const extraPages = await Promise.all(
    extraOffsets.map((offset) =>
      db.rpc("browse_items", {
        p_query: opts.query?.trim() || undefined,
        p_level: opts.level ?? undefined,
        p_scope: opts.scope ?? "area",
        p_limit: 100,
        p_offset: offset,
      }),
    ),
  );
  for (const res of extraPages) {
    if (res.error) throw res.error;
  }

  let rows = mapBrowseRows([...(first.data ?? []), ...extraPages.flatMap((res) => res.data ?? [])]);
  if (opts.topic) {
    rows = rows.filter((r) => expandTopics(r.analysis.topics).includes(opts.topic!));
  }
  if (opts.sort === "deadline") {
    const nowMs = Date.now();
    const upcomingMs = (r: BrowseRow) => {
      const raw = r.item.comment_deadline ?? r.item.event_at;
      if (!raw) return null;
      const ms = Date.parse(raw);
      return Number.isFinite(ms) && ms >= nowMs ? ms : null;
    };
    const activityMs = (r: BrowseRow) => {
      const raw = r.item.comment_deadline ?? r.item.event_at ?? r.item.last_action_at;
      return raw ? Date.parse(raw) || 0 : 0;
    };
    rows.sort((a, b) => {
      const da = upcomingMs(a);
      const db = upcomingMs(b);
      if (da !== null && db !== null) return da - db;
      if (da !== null) return -1;
      if (db !== null) return 1;
      return Number(b.active) - Number(a.active) || activityMs(b) - activityMs(a);
    });
  }

  const start = page * BROWSE_PAGE_SIZE;
  return {
    total: rows.length,
    rows: rows.slice(start, start + BROWSE_PAGE_SIZE),
  };
}

export type RepActivityItem = {
  id: string;
  title: string;
  headline: string | null;
  status: string | null;
  last_action_at: string | null;
  level: "city" | "county" | "state" | "federal";
  role: string;
  vote: string | null;
};

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

export async function getOfficialActivity(db: DB, officialIds: string[], limit = 200): Promise<Record<string, RepActivityItem[]>> {
  const byOfficial: Record<string, RepActivityItem[]> = {};
  if (!officialIds.length) return byOfficial;
  const { data } = await db
    .from("item_officials")
    .select("official_id, role, vote, items!inner(id, title, status, last_action_at, level, item_analysis(headline))")
    .in("official_id", officialIds)
    .order("last_action_at", { referencedTable: "items", ascending: false })
    .limit(limit);

  for (const row of data ?? []) {
    const it = row.items;
    if (!it) continue;
    const list = (byOfficial[row.official_id] ??= []);
    if (list.some((x) => x.id === it.id && x.role === row.role)) continue;
    list.push({
      id: it.id,
      title: it.title,
      headline: it.item_analysis?.headline?.trim() || null,
      status: it.status,
      last_action_at: it.last_action_at,
      level: it.level,
      role: row.role,
      vote: row.vote,
    });
  }
  for (const list of Object.values(byOfficial)) {
    list.sort((a, b) => (b.last_action_at ?? "").localeCompare(a.last_action_at ?? ""));
  }
  return byOfficial;
}

export async function getItem(db: DB, id: string) {
  const { data } = await db
    .from("items")
    .select("*, item_analysis(*), item_officials(role, vote, officials(*)), item_locations(address, lat, lng)")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function getStats(db: DB, userId: string) {
  const [points, badges, allBadges, actions, pets] = await Promise.all([
    db.from("points_ledger").select("points").eq("user_id", userId),
    db.from("user_badges").select("badge_slug, awarded_at").eq("user_id", userId),
    db.from("badges").select("*").order("slug"),
    db
      .from("user_actions")
      .select("type, created_at, item_id, items(level, type, item_analysis(topics))")
      .eq("user_id", userId),
    db.from("user_interests").select("topic_slugs").eq("user_id", userId).eq("is_pet", true),
  ]);
  const total = (points.data ?? []).reduce((s, p) => s + p.points, 0);
  const earned = new Map((badges.data ?? []).map((b) => [b.badge_slug, b.awarded_at]));
  const acts: ActionRecord[] = (actions.data ?? []).map((a) => ({
    type: a.type as ActionType,
    created_at: a.created_at,
    item_id: a.item_id,
    item_level: (a.items?.level ?? null) as Level | null,
    item_type: (a.items?.type ?? null) as ItemType | null,
    item_topics: expandTopics(a.items?.item_analysis?.topics ?? []),
  }));
  const ctx = {
    actions: acts,
    petTopics: (pets.data ?? []).flatMap((p) => p.topic_slugs),
    now: new Date(),
  };
  return {
    points: total,
    level: levelForPoints(total),
    streak: weeklyStreak(acts, ctx.now),
    voiceCount: acts.filter((a) => VOICE_ACTIONS.includes(a.type)).length,
    badges: (allBadges.data ?? []).map((b) => ({
      ...b,
      awarded_at: earned.get(b.slug) ?? null,
      progress: badgeProgress(b.slug, ctx),
    })),
  };
}
