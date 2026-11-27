import "server-only";
/** Loads the state officials for a ZIP and makes their records available for linking. */
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchStateOfficials } from "./officials";

export async function resolveStateOfficials(lat: number, lng: number, state: string): Promise<{
  ids: string[] | null;
  stateLookup: "ok" | "skipped" | "failed";
}> {
  if (!process.env.OPENSTATES_API_KEY) return { ids: null, stateLookup: "skipped" };

  try {
    const rows = await fetchStateOfficials(lat, lng, state);
    const officials = [...new Map(rows.map((row) => [row.id, row])).values()];
    if (officials.length) {
      const { error } = await createAdminClient().from("officials").upsert(officials, { onConflict: "id" });
      if (error) throw error;
    }
    return { ids: officials.map((o) => o.id), stateLookup: "ok" };
  } catch (err) {
    console.error("Open States lookup failed", err);
    return { ids: null, stateLookup: "failed" };
  }
}
