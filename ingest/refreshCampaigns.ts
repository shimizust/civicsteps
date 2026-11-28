import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { campaignsForItem } from "../lib/campaigns";
import { alertsForItem, organizations, type CampaignSnapshot } from "../lib/advocacy";
import { checkSource } from "./campaignSources";

async function main() {
  const bundle = process.argv.includes("--bundle");
  const file = "lib/campaign-snapshot.json";
  const db = bundle ? null : createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  let previous: CampaignSnapshot = JSON.parse(await readFile(file, "utf8"));
  if (db) {
    const { data, error } = await db.from("campaign_snapshot").select("sources").eq("id", 1).maybeSingle();
    if (error) throw error;
    previous = data?.sources ?? previous;
  }
  const results: CampaignSnapshot = [];
  for (let start = 0; start < organizations.length; start += 8) {
    results.push(...await Promise.all(organizations.slice(start, start + 8).map((org) =>
      checkSource(org, previous.find((s) => s.organization === org.name)))));
  }
  if (!results.some((s) => s.checked === s.attempted)) throw new Error("No directory could be refreshed");
  if (db) {
    let cursor = "";
    let checked = 0;
    let matched = 0;
    while (true) {
      const query = db.from("items").select("id,url,action_url,source,external_id").order("id").limit(500);
      if (cursor) query.gt("id", cursor);
      const { data, error } = await query;
      if (error) throw error;
      if (!data.length) break;
      for (const item of data) {
        checked++;
        if (alertsForItem(results, item).length || campaignsForItem(item.source, item.external_id, []).direct.length) matched++;
      }
      cursor = data[data.length - 1].id;
    }
    const { error } = await db.from("campaign_snapshot").upsert({
      id: 1, sources: results, items_checked: checked, items_matched: matched, checked_at: new Date().toISOString(),
    });
    if (error) throw error;
  } else {
    await writeFile(file, JSON.stringify(results, null, 2) + "\n");
  }
  console.log("Directories checked:", results.filter((s) => s.checked === s.attempted).length, "/", results.length);
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
