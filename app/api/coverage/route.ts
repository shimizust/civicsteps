import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAreaProgress } from "@/lib/data";
import { areasFor, citySupportFor } from "@/lib/coverageStatus";
import { placeName } from "@/lib/place";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to check coverage." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("zip, state, jurisdiction_ids")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Couldn't load profile coverage." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const areas = profile ? areasFor(profile.state, profile.jurisdiction_ids) : [];
  const place = profile ? placeName(profile.jurisdiction_ids, profile.state) : null;
  const citySupport = profile ? citySupportFor(profile.jurisdiction_ids) : null;
  const progress = await getAreaProgress(supabase, areas);

  return NextResponse.json(
    {
      zip: profile?.zip ?? null,
      place,
      citySupport,
      areas: progress,
      now: Date.now(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
