import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getInterests, getMyOfficials, getProfile } from "@/lib/data";
import { aiConfigured } from "@/lib/ai/client";
import { placeName } from "@/lib/place";
import type { Demographics } from "@/lib/taxonomy";
import { Wizard } from "./Wizard";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/onboarding");
  const [{ step }, profile, interests, officials] = await Promise.all([
    searchParams,
    getProfile(supabase, user.id),
    getInterests(supabase, user.id),
    getMyOfficials(supabase, user.id),
  ]);

  return (
    <Wizard
      initialStep={Math.min(Math.max(parseInt(step ?? "1", 10) || 1, 1), 5)}
      returning={!!profile?.onboarded_at}
      zip={profile?.zip ?? ""}
      place={profile ? placeName(profile.jurisdiction_ids, profile.state) : null}
      officialsCount={officials.length}
      demographics={(profile?.demographics ?? {}) as Demographics}
      topics={interests.filter((i) => !i.is_pet).flatMap((i) => i.topic_slugs)}
      pets={interests.filter((i) => i.is_pet)}
      prefs={{ alerts: profile?.notify_alerts ?? true, digest: profile?.notify_digest ?? true }}
      aiEnabled={aiConfigured()}
    />
  );
}
