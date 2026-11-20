/** Server-side data loaders shared by pages. All take a user-scoped Supabase client (RLS applies). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { buildFeed, type Candidate, type Interest } from "@/lib/relevance";
import { groupsForDemographics, type Demographics } from "@/lib/taxonomy";
import { levelForPoints, weeklyStreak, VOICE_ACTIONS, type ActionType } from "@/lib/gamification";

type DB = SupabaseClient<Database>;

export async function getProfile(db: DB, userId: string) {
  const { data } = await db.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  return data;
}

export async function getInterests(db: DB, userId: string): Promise<(Interest & { id: string })[]> {
  const { data } = await db.from("user_interests").select("id, label, topic_slugs, keywords, is_pet").eq("user_id", userId).order("created_at");
  return data ?? [];
}

export async function getFeed(db: DB, userId: string) {
  const [profile, interests, candidatesRes, actionsRes] = await Promise.all([
    getProfile(db, userId),
    getInterests(db, userId),
    db.rpc("feed_candidates", { p_limit: 400 }),
    db.from("user_actions").select("item_id, type").eq("user_id", userId),
  ]);
  if (candidatesRes.error) throw candidatesRes.error;
  const acted = new Set(
    (actionsRes.data ?? []).filter((a) => a.item_id && VOICE_ACTIONS.includes(a.type as ActionType)).map((a) => a.item_id!),
  );
  const candidates = (candidatesRes.data ?? []) as unknown as Candidate[];
  return buildFeed(candidates, {
    interests,
    groups: groupsForDemographics((profile?.demographics ?? {}) as Demographics),
    jurisdictionIds: profile?.jurisdiction_ids ?? [],
    actedItemIds: acted,
    now: new Date(),
  });
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
