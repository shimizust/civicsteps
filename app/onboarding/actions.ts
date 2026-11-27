"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { mapInterest } from "@/lib/ai/mapInterest";
import { cleanDemographics, TOPIC_SLUGS, type Demographics } from "@/lib/taxonomy";

async function me() {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/onboarding");
  return { supabase, user };
}

export async function saveDemographics(d: Demographics) {
  const { supabase, user } = await me();
  const parsed = cleanDemographics(d);
  await supabase.from("profiles").upsert({ user_id: user.id, demographics: parsed }, { onConflict: "user_id" });
  revalidatePath("/feed");
  revalidatePath("/profile");
}

export async function saveTopics(slugs: string[]) {
  const { supabase, user } = await me();
  const valid = [...new Set(slugs)].filter((s) => TOPIC_SLUGS.has(s)).slice(0, 40);
  await supabase.from("user_interests").delete().eq("user_id", user.id).eq("is_pet", false);
  if (valid.length) {
    const { TOPICS } = await import("@/lib/taxonomy");
    await supabase.from("user_interests").insert(
      valid.map((slug) => ({ user_id: user.id, label: TOPICS.find((t) => t.slug === slug)!.name, topic_slugs: [slug], is_pet: false })),
    );
  }
  revalidatePath("/feed");
  revalidatePath("/profile");
}

export type PetIssue = { id: string; label: string; topic_slugs: string[]; keywords: string[] };

export async function addPetIssue(label: string): Promise<{ ok: true; issue: PetIssue } | { ok: false; error: string }> {
  const { supabase, user } = await me();
  const clean = label.trim().slice(0, 120);
  if (clean.length < 3) return { ok: false, error: "Describe the issue in a few words." };
  const { count } = await supabase.from("user_interests").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_pet", true);
  if ((count ?? 0) >= 10) return { ok: false, error: "You can track up to 10 pet issues." };

  const mapping = await mapInterest(clean);
  const { data, error } = await supabase
    .from("user_interests")
    .insert({ user_id: user.id, label: clean, topic_slugs: mapping.topics, keywords: mapping.keywords, is_pet: true })
    .select("id, label, topic_slugs, keywords")
    .single();
  if (error) return { ok: false, error: "Couldn't save that issue." };
  revalidatePath("/feed");
  revalidatePath("/profile");
  return { ok: true, issue: data };
}

export async function updatePetKeywords(id: string, keywords: string[]) {
  const { supabase, user } = await me();
  const clean = [...new Set(keywords.map((k) => k.toLowerCase().trim()).filter((k) => k.length >= 3))].slice(0, 15);
  await supabase.from("user_interests").update({ keywords: clean }).eq("id", id).eq("user_id", user.id);
  revalidatePath("/feed");
  revalidatePath("/profile");
}

export async function removeInterest(id: string) {
  const { supabase, user } = await me();
  await supabase.from("user_interests").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/feed");
  revalidatePath("/profile");
}

export async function finishOnboarding(prefs: { alerts: boolean; digest: boolean }, dest: "/feed" | "/profile" = "/feed") {
  const { supabase, user } = await me();
  const target = dest === "/profile" ? "/profile" : "/feed";
  await supabase
    .from("profiles")
    .upsert({ user_id: user.id, notify_alerts: prefs.alerts, notify_digest: prefs.digest, onboarded_at: new Date().toISOString() }, { onConflict: "user_id" });
  revalidatePath("/feed");
  revalidatePath("/profile");
  redirect(target);
}
