"use server";
import { revalidatePath } from "next/cache";
import { recordAction, type ActionResult } from "@/lib/actions";
import type { ActionType } from "@/lib/gamification";
import { requireUser } from "@/lib/supabase/server";
import { getRegistry } from "@/lib/data";
import { normalizeAnswer, PROFILE_PREFIX, resolveKey } from "@/lib/facts";
import { favoriteSnapshot } from "@/lib/favorites";
import { cleanDemographics, DEMOGRAPHIC_QUESTIONS } from "@/lib/taxonomy";

const ALLOWED: ActionType[] = ["read", "emailed", "called", "commented", "signed", "attended", "shared"];

export async function logAction(type: ActionType, itemId: string | null, officialId: string | null = null): Promise<ActionResult> {
  if (!ALLOWED.includes(type)) throw new Error("Unknown action");
  const res = await recordAction({ type, itemId, officialId });
  if (!res.duplicate && type !== "read") revalidatePath("/feed");
  return res;
}

// ---------------------------------------------------------------- answers to "personalize this" questions

export type AnswerInput = {
  kind: "fact" | "profile";
  key: string;
  /** An option value, or null for "prefer not to say". */
  value: string | null;
  source: "item" | "feed" | "agent" | "profile";
  itemId?: string | null;
};

/**
 * Saves one answer. Onboarding questions ("profile") go into profiles.demographics, where the wizard
 * reads them; a declined one is remembered in user_facts so we stop asking. Specific facts go to user_facts.
 */
export async function answerFact(input: AnswerInput): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false };
  const itemId = input.itemId && /^[0-9a-f-]{36}$/i.test(input.itemId) ? input.itemId : null;
  const source = (["item", "feed", "agent", "profile"] as const).includes(input.source) ? input.source : "item";

  if (input.kind === "profile") {
    const q = DEMOGRAPHIC_QUESTIONS.find((x) => x.key === input.key);
    if (!q) return { ok: false };
    const declineKey = `${PROFILE_PREFIX}${q.key}`;
    if (input.value === null) {
      await supabase.from("user_facts").upsert({ user_id: user.id, fact_key: declineKey, value: null, source, item_id: itemId });
    } else {
      const cleaned = cleanDemographics({ [q.key]: input.value });
      if (!(q.key in cleaned)) return { ok: false };
      const { data: profile } = await supabase.from("profiles").select("demographics").eq("user_id", user.id).maybeSingle();
      const demographics = { ...cleanDemographics((profile?.demographics ?? {}) as Record<string, unknown>), ...cleaned };
      await supabase.from("profiles").update({ demographics }).eq("user_id", user.id);
      await supabase.from("user_facts").delete().eq("user_id", user.id).eq("fact_key", declineKey);
    }
  } else {
    const registry = await getRegistry(supabase, [input.key]);
    const key = resolveKey(registry, input.key);
    const fact = registry.get(key);
    if (!fact) return { ok: false };
    const value = normalizeAnswer(fact, input.value);
    if (value === undefined) return { ok: false };
    await supabase.from("user_facts").upsert({ user_id: user.id, fact_key: key, value, source, item_id: itemId });
  }

  revalidatePath("/feed");
  revalidatePath("/profile");
  if (itemId) revalidatePath(`/items/${itemId}`);
  return { ok: true };
}

/** Forgets an answer, so it can be asked again. */
export async function clearFact(key: string) {
  const { supabase, user } = await requireUser();
  if (!user) return;
  await supabase.from("user_facts").delete().eq("user_id", user.id).eq("fact_key", key);
  revalidatePath("/profile");
  revalidatePath("/feed");
}

// ---------------------------------------------------------------- "is this relevant to you?" votes

/** Records (or with null, clears) the user's verdict on an item. The feed re-ranks from these on next load. */
export async function setRelevance(itemId: string, relevant: boolean | null, source: "feed" | "browse" | "item"): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(itemId)) return { ok: false };
  const src = (["feed", "browse", "item"] as const).includes(source) ? source : "item";
  const { error } =
    relevant === null
      ? await supabase.from("item_feedback").delete().eq("user_id", user.id).eq("item_id", itemId)
      : await supabase.from("item_feedback").upsert({ user_id: user.id, item_id: itemId, relevant, source: src });
  if (error) return { ok: false };
  if (relevant === false) {
    await supabase.from("item_favorites").delete().eq("user_id", user.id).eq("item_id", itemId);
    revalidatePath("/favorites");
    revalidatePath("/profile");
  }
  revalidatePath("/feed");
  revalidatePath("/browse");
  revalidatePath(`/items/${itemId}`);
  return { ok: true };
}

// ---------------------------------------------------------------- favorited follow-up issues

const ITEM_PROGRESS_COLS = "status, last_action, last_action_at, enacted_at, comment_deadline, event_at";
const FAV_SOURCES = ["feed", "browse", "item", "favorites"] as const;

/** Favorites or unfavorites an issue to keep following up on, snapshotting its current progress. */
export async function setFavorite(
  itemId: string,
  favorited: boolean,
  source: "feed" | "browse" | "item" | "favorites",
): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(itemId)) return { ok: false };
  const src = FAV_SOURCES.includes(source) ? source : "item";

  if (!favorited) {
    const { error } = await supabase.from("item_favorites").delete().eq("user_id", user.id).eq("item_id", itemId);
    if (error) return { ok: false };
  } else {
    const { data: item, error: itemErr } = await supabase.from("items").select(ITEM_PROGRESS_COLS).eq("id", itemId).maybeSingle();
    if (itemErr || !item) return { ok: false };
    const { error } = await supabase.from("item_favorites").upsert({
      user_id: user.id,
      item_id: itemId,
      source: src,
      ...favoriteSnapshot(item),
    });
    if (error) return { ok: false };
    await supabase.from("item_feedback").delete().eq("user_id", user.id).eq("item_id", itemId).eq("relevant", false);
  }

  revalidatePath("/feed");
  revalidatePath("/favorites");
  revalidatePath("/browse");
  revalidatePath("/profile");
  revalidatePath(`/items/${itemId}`);
  return { ok: true };
}

/** Updates last-seen progress when a user visits a favorited item (without clearing the current page banner). */
export async function markFavoriteSeen(itemId: string): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(itemId)) return { ok: false };
  const { data: item, error: itemErr } = await supabase.from("items").select(ITEM_PROGRESS_COLS).eq("id", itemId).maybeSingle();
  if (itemErr || !item) return { ok: false };
  const { error } = await supabase
    .from("item_favorites")
    .update(favoriteSnapshot(item))
    .eq("user_id", user.id)
    .eq("item_id", itemId);
  if (error) return { ok: false };
  revalidatePath("/feed");
  revalidatePath("/favorites");
  return { ok: true };
}
