import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getInterests, getProfile } from "@/lib/data";
import { aiConfigured } from "@/lib/ai/client";
import type { Demographics } from "@/lib/taxonomy";
import { Wizard } from "./Wizard";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/onboarding");
  const [{ step }, profile, interests] = await Promise.all([searchParams, getProfile(supabase, user.id), getInterests(supabase, user.id)]);

  return (
    <Wizard
      initialStep={Math.min(Math.max(parseInt(step ?? "1", 10) || 1, 1), 5)}
      returning={!!profile?.onboarded_at}
      address={profile?.address ?? ""}
      demographics={(profile?.demographics ?? {}) as Demographics}
      topics={interests.filter((i) => !i.is_pet).flatMap((i) => i.topic_slugs)}
      pets={interests.filter((i) => i.is_pet)}
      prefs={{ alerts: profile?.notify_alerts ?? true, digest: profile?.notify_digest ?? true }}
      aiEnabled={aiConfigured()}
    />
  );
}
