"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { geocodeZip } from "@/lib/civic/geocode";
import { resolveOfficials } from "@/lib/civic/resolve";
import { areasFor, requestAreaCoverage } from "@/lib/coverage";
import { mapInterest } from "@/lib/ai/mapInterest";
import { cleanDemographics, TOPIC_SLUGS, type Demographics } from "@/lib/taxonomy";

async function me() {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/onboarding");
  return { supabase, user };
}

export type ZipResult =
  | {
      ok: true;
      zip: string;
      summary: string[];
      officials: number;
      stateLookup: "ok" | "skipped" | "failed";
      coverage: string[] | null;
    }
  | { ok: false; error: string };

export async function saveZip(input: string): Promise<ZipResult> {
  const { supabase, user } = await me();
  const zip = input.trim().match(/^(\d{5})(?:-\d{4})?$/)?.[1];
  if (!zip) return { ok: false, error: "Enter a 5-digit ZIP code." };

  let d;
  try {
    d = await geocodeZip(zip);
  } catch {
    return { ok: false, error: "The district lookup service isn't responding. Try again in a minute." };
  }
  if (!d) return { ok: false, error: "We don't have districts for that ZIP. If it's a PO box ZIP, try the ZIP where you live." };

  const { error } = await supabase.from("profiles").upsert(
    { user_id: user.id, zip: d.zip, lat: d.lat, lng: d.lng, state: d.state, jurisdiction_ids: d.jurisdictionIds },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false, error: "Couldn't save your ZIP code." };

  // New state or city? Start pulling in its items now rather than leaving the feed empty until tonight's run.
  const [{ count, stateLookup }, coverage] = await Promise.all([
    resolveOfficials(user.id, d),
    requestAreaCoverage(areasFor(d.state, d.jurisdictionIds)).catch((err) => {
      console.error("coverage request failed", err);
      return null;
    }),
  ]);
  const summary = [
    d.place && `City of ${d.place}`,
    d.county,
    d.cd !== null && (d.cd === 0 ? `${d.state} at-large congressional district` : `${d.state} congressional district ${d.cd}`),
    d.sldu && `State senate district ${d.sldu}`,
    d.sldl && `State house district ${d.sldl}`,
  ].filter((x): x is string => !!x);
  revalidatePath("/reps");
  revalidatePath("/feed");
  return { ok: true, zip: d.zip, summary, officials: count, stateLookup, coverage };
}


export async function saveDemographics(d: Demographics) {
  const { supabase, user } = await me();
  const parsed = cleanDemographics(d);
  await supabase.from("profiles").upsert({ user_id: user.id, demographics: parsed }, { onConflict: "user_id" });
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
  return { ok: true, issue: data };
}

export async function updatePetKeywords(id: string, keywords: string[]) {
  const { supabase, user } = await me();
  const clean = [...new Set(keywords.map((k) => k.toLowerCase().trim()).filter((k) => k.length >= 3))].slice(0, 15);
  await supabase.from("user_interests").update({ keywords: clean }).eq("id", id).eq("user_id", user.id);
}

export async function removeInterest(id: string) {
  const { supabase, user } = await me();
  await supabase.from("user_interests").delete().eq("id", id).eq("user_id", user.id);
}

export async function finishOnboarding(prefs: { alerts: boolean; digest: boolean }) {
  const { supabase, user } = await me();
  await supabase
    .from("profiles")
    .upsert({ user_id: user.id, notify_alerts: prefs.alerts, notify_digest: prefs.digest, onboarded_at: new Date().toISOString() }, { onConflict: "user_id" });
  revalidatePath("/feed");
  redirect("/feed");
}
