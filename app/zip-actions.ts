"use server";
import { revalidatePath } from "next/cache";
import { geocodeZip } from "@/lib/civic/geocode";
import { resolveStateOfficials } from "@/lib/civic/resolve";
import { areasFor, requestAreaCoverage } from "@/lib/coverage";
import { placeName } from "@/lib/place";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

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
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in to save or switch ZIP codes." };
  const zip = typeof input === "string" ? input.trim().match(/^(\d{5})(?:-\d{4})?$/)?.[1] : undefined;
  if (!zip) return { ok: false, error: "Enter a 5-digit ZIP code." };

  const { data: saved, error: readError } = await supabase
    .from("saved_zips")
    .select("lat, lng, state, jurisdiction_ids")
    .eq("user_id", user.id)
    .eq("zip", zip)
    .maybeSingle();
  if (readError) {
    console.error("saved ZIP lookup failed", readError);
    return { ok: false, error: "Couldn't load your saved ZIP codes. Try again in a moment." };
  }

  let lat: number, lng: number, state: string, jurisdictionIds: string[];
  let summary: string[];
  if (saved?.lat != null && saved.lng != null && saved.state && saved.jurisdiction_ids.length) {
    lat = saved.lat;
    lng = saved.lng;
    state = saved.state;
    jurisdictionIds = saved.jurisdiction_ids;
    summary = [placeName(jurisdictionIds, state) ?? state];
  } else {
    let districts;
    try {
      districts = await geocodeZip(zip);
    } catch {
      return { ok: false, error: "The district lookup service isn't responding. Try again in a minute." };
    }
    if (!districts) return { ok: false, error: "We don't have districts for that ZIP. If it's a PO box ZIP, try a residential ZIP in the area." };
    ({ lat, lng, state, jurisdictionIds } = districts);
    summary = [
      districts.place && `City of ${districts.place}`,
      districts.county,
      districts.cd !== null && (districts.cd === 0 ? `${state} at-large congressional district` : `${state} congressional district ${districts.cd}`),
      districts.sldu && `State senate district ${districts.sldu}`,
      districts.sldl && `State house district ${districts.sldl}`,
    ].filter((x): x is string => !!x);
  }

  const { ids, stateLookup } = await resolveStateOfficials(lat, lng, state);
  const { data: officials, error } = await createAdminClient().rpc("activate_zip", {
    p_user: user.id, p_zip: zip, p_lat: lat, p_lng: lng, p_state: state,
    p_jurisdiction_ids: jurisdictionIds,
    ...(ids !== null && { p_state_official_ids: ids }),
  });
  if (error) {
    console.error("ZIP activation failed", error);
    return { ok: false, error: "Couldn't set your active ZIP code. Try again in a moment." };
  }

  const coverage = await requestAreaCoverage(areasFor(state, jurisdictionIds)).catch((err) => {
    console.error("coverage request failed", err);
    return null;
  });
  revalidatePath("/", "layout");
  return { ok: true, zip, summary, officials, stateLookup, coverage };
}
