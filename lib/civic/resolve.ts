import "server-only";
/** Works out which officials represent a user and stores the links. */
import { createAdminClient } from "@/lib/supabase/admin";
import { federalSeatIds, fetchStateOfficials } from "./officials";
import type { Districts } from "./geocode";

export async function resolveOfficials(userId: string, d: Districts): Promise<{ count: number; stateLookup: "ok" | "skipped" | "failed" }> {
  const admin = createAdminClient();
  const ids = new Set<string>();

  const { data: fed } = await admin.from("officials").select("id").eq("level", "federal").in("jurisdiction_id", federalSeatIds(d.state, d.cd));
  fed?.forEach((o) => ids.add(o.id));

  let stateLookup: "ok" | "skipped" | "failed" = process.env.OPENSTATES_API_KEY ? "ok" : "skipped";
  if (stateLookup === "ok") {
    try {
      const rows = await fetchStateOfficials(d.lat, d.lng, d.state);
      if (rows.length) await admin.from("officials").upsert(rows, { onConflict: "id" });
      rows.forEach((r) => ids.add(r.id));
    } catch (err) {
      console.error("Open States lookup failed", err);
      stateLookup = "failed";
    }
  }

  const { data: local } = await admin.from("officials").select("id").in("level", ["city", "county"]).in("jurisdiction_id", d.jurisdictionIds);
  local?.forEach((o) => ids.add(o.id));

  await admin.from("user_officials").delete().eq("user_id", userId);
  if (ids.size) await admin.from("user_officials").insert([...ids].map((official_id) => ({ user_id: userId, official_id })));
  return { count: ids.size, stateLookup };
}
