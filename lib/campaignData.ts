import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import initial from "./campaign-snapshot.json";
import type { CampaignSnapshot } from "./advocacy";

export async function getCampaignData(db: SupabaseClient<Database>) {
  const { data } = await db.from("campaign_snapshot").select("*").eq("id", 1).maybeSingle();
  return {
    snapshot: (data?.sources ?? initial) as CampaignSnapshot,
    audit: data && { checked: data.items_checked, matched: data.items_matched, date: data.checked_at },
  };
}
