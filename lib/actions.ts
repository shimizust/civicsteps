import "server-only";
/**
 * Records a civic action and awards points/badges. The action row is inserted as the user
 * (RLS: own rows only); points and badges are written with the service role so clients
 * can't grant themselves rewards.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { newlyEarnedBadges, POINTS, type ActionRecord, type ActionType, type BadgeDef } from "@/lib/gamification";
import { expandTopics } from "@/lib/taxonomy";

export type ActionResult = { points: number; newBadges: Pick<BadgeDef, "slug" | "name" | "icon">[]; duplicate: boolean };

export async function recordAction(input: { type: ActionType; itemId?: string | null; officialId?: string | null }): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: action, error } = await supabase
    .from("user_actions")
    .insert({ user_id: user.id, type: input.type, item_id: input.itemId ?? null, official_id: input.officialId ?? null })
    .select("id")
    .maybeSingle();
  if (error?.code === "23505") return { points: 0, newBadges: [], duplicate: true }; // already did this
  if (error || !action) throw error ?? new Error("Could not record action");

  const admin = createAdminClient();
  const points = POINTS[input.type];
  await admin.from("points_ledger").insert({ user_id: user.id, action_id: action.id, points, reason: input.type });

  const newBadges = await awardBadges(user.id);
  return { points, newBadges: newBadges.map(({ slug, name, icon }) => ({ slug, name, icon })), duplicate: false };
}

async function awardBadges(userId: string): Promise<BadgeDef[]> {
  const admin = createAdminClient();
  const [actionsRes, haveRes, petsRes] = await Promise.all([
    admin
      .from("user_actions")
      .select("type, created_at, item_id, items(level, type, item_analysis(topics))")
      .eq("user_id", userId),
    admin.from("user_badges").select("badge_slug").eq("user_id", userId),
    admin.from("user_interests").select("topic_slugs").eq("user_id", userId).eq("is_pet", true),
  ]);
  const actions: ActionRecord[] = (actionsRes.data ?? []).map((a) => ({
    type: a.type,
    created_at: a.created_at,
    item_id: a.item_id,
    item_level: a.items?.level ?? null,
    item_type: a.items?.type ?? null,
    item_topics: expandTopics(a.items?.item_analysis?.topics ?? []),
  }));
  const earned = newlyEarnedBadges(
    { actions, petTopics: (petsRes.data ?? []).flatMap((p) => p.topic_slugs), now: new Date() },
    (haveRes.data ?? []).map((b) => b.badge_slug),
  );
  if (earned.length) {
    await admin.from("user_badges").upsert(
      earned.map((b) => ({ user_id: userId, badge_slug: b.slug })),
      { onConflict: "user_id,badge_slug", ignoreDuplicates: true },
    );
  }
  return earned;
}
