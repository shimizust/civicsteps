import { readFile, writeFile } from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";
import { campaignsForItem, campaignIssues } from "../lib/campaigns";
import {
  alertsForItem,
  congressReferenceKey,
  currentCongressNumber,
  itemReferenceKeys,
  organizations,
  parseCongressReference,
  parseOpenStatesReference,
  type Alert,
  type CampaignSnapshot,
} from "../lib/advocacy";
import { aiConfigured } from "../lib/ai/client";
import { HEURISTIC_VERSION, heuristicAnalysis } from "../lib/ai/heuristic";
import { checkSource } from "./campaignSources";
import { fetchCongressBillById } from "./congress";
import { contentHash, type NormalizedItem } from "./normalize";
import { fetchStateBillByKey } from "./openstates";

type ItemRow = {
  id: string;
  url: string | null;
  action_url: string | null;
  source: string;
  external_id: string;
  title: string;
  state: string | null;
};

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

function collectReferencedKeys(results: CampaignSnapshot): string[] {
  const keys = new Set<string>();
  for (const source of results) {
    for (const alert of source.alerts) {
      if (alert.state !== "listed") continue;
      for (const ref of alert.references) keys.add(ref);
    }
  }
  for (const issue of campaignIssues) {
    for (const cgId of issue.congressIds) {
      const m = cgId.match(/^(\d+)-([A-Z]+)-(\d+)$/i);
      if (m) {
        const key = congressReferenceKey(Number(m[1]), m[2], m[3]);
        if (key) keys.add(key);
      }
    }
  }
  return [...keys];
}

async function pullMissingCampaignBills(
  db: SupabaseClient<Database>,
  results: CampaignSnapshot,
  existingItems: ItemRow[],
): Promise<ItemRow[]> {
  const existingKeys = new Set<string>();
  const existingExtIds = new Set<string>();
  for (const item of existingItems) {
    existingExtIds.add(`${item.source}|${item.external_id}`);
    for (const key of itemReferenceKeys(item)) existingKeys.add(key);
  }

  const allRefs = collectReferencedKeys(results);
  const currentCong = currentCongressNumber();
  const missingFed = allRefs
    .filter((ref) => !existingKeys.has(ref))
    .map(parseCongressReference)
    .filter((x): x is NonNullable<typeof x> => !!x && x.congress === currentCong);
  const missingState = allRefs
    .filter((ref) => !existingKeys.has(ref))
    .map(parseOpenStatesReference)
    .filter((x): x is NonNullable<typeof x> => !!x);

  const pulled: NormalizedItem[] = [];
  const fedLimit = process.env.API_DATA_GOV_KEY ? 30 : 10;
  for (const fed of missingFed.slice(0, fedLimit)) {
    try {
      const item = await fetchCongressBillById(fed.congress, fed.type, fed.number);
      if (item && !existingExtIds.has(`${item.source}|${item.external_id}`)) {
        pulled.push(item);
        existingExtIds.add(`${item.source}|${item.external_id}`);
      }
    } catch (err) {
      console.warn(`Failed pulling federal bill ${fed.congress}-${fed.type}-${fed.number}:`, err instanceof Error ? err.message : err);
    }
    if (!process.env.API_DATA_GOV_KEY) await new Promise((r) => setTimeout(r, 500));
  }

  if (process.env.OPENSTATES_API_KEY) {
    const stateTargets = missingState.slice(0, 15);
    for (let i = 0; i < stateTargets.length; i++) {
      const st = stateTargets[i];
      try {
        const item = await fetchStateBillByKey(st.state, st.session, st.identifier);
        if (item && !existingExtIds.has(`${item.source}|${item.external_id}`)) {
          pulled.push(item);
          existingExtIds.add(`${item.source}|${item.external_id}`);
        }
      } catch (err) {
        console.warn(`Failed pulling state bill ${st.state} ${st.identifier}:`, err instanceof Error ? err.message : err);
      }
      if (i + 1 < stateTargets.length) await new Promise((r) => setTimeout(r, 6500));
    }
  }

  if (!pulled.length) return [];

  const uniquePulled = [...new Map(pulled.map((i) => [`${i.source}|${i.external_id}`, i])).values()];
  const inserted: ItemRow[] = [];

  for (const batch of chunk(uniquePulled, 100)) {
    const rows = batch.map(({ officials: _officials, ...rest }) => ({
      ...rest,
      content_hash: contentHash(rest),
      analysis_status: "pending" as const,
      analysis_batch_id: null,
      located_at: null,
    }));
    const { data, error } = await db
      .from("items")
      .upsert(rows, { onConflict: "source,external_id" })
      .select("id,url,action_url,source,external_id,title,state");
    if (error) throw error;
    inserted.push(...data);
  }

  const byExt = new Map(uniquePulled.map((i) => [`${i.source}|${i.external_id}`, i]));
  const idByExt = new Map(inserted.map((r) => [`${r.source}|${r.external_id}`, r.id]));

  const links = uniquePulled.flatMap((i) => {
    const itemId = idByExt.get(`${i.source}|${i.external_id}`);
    return itemId ? (i.officials ?? []).map((o) => ({ item_id: itemId, ...o })) : [];
  });
  if (links.length) {
    const knownIds = new Set<string>();
    for (const ids of chunk([...new Set(links.map((l) => l.official_id))], 100)) {
      const { data: known } = await db.from("officials").select("id").in("id", ids);
      for (const k of known ?? []) knownIds.add(k.id);
    }
    const valid = links.filter((l) => knownIds.has(l.official_id));
    if (valid.length) {
      const { error } = await db.from("item_officials").upsert(valid, { onConflict: "item_id,official_id,role", ignoreDuplicates: true });
      if (error) throw error;
    }
  }

  const analysisRows = inserted.map((row) => {
    const norm = byExt.get(`${row.source}|${row.external_id}`)!;
    return {
      item_id: row.id,
      ...heuristicAnalysis({ title: norm.title, description: norm.description ?? null, agency: norm.agency ?? null }),
      model: "heuristic",
      prompt_version: HEURISTIC_VERSION,
    };
  });
  for (const batch of chunk(analysisRows, 100)) {
    const { error } = await db.from("item_analysis").upsert(batch, { onConflict: "item_id", ignoreDuplicates: true });
    if (error) throw error;
  }

  return inserted;
}

async function main() {
  const bundle = process.argv.includes("--bundle");
  const file = "lib/campaign-snapshot.json";
  const db = bundle ? null : createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  let previous: CampaignSnapshot = JSON.parse(await readFile(file, "utf8"));
  if (db) {
    const { data, error } = await db.from("campaign_snapshot").select("sources").eq("id", 1).maybeSingle();
    if (error) throw error;
    previous = (data?.sources as CampaignSnapshot | undefined) ?? previous;
  }

  const useAi = aiConfigured();
  const results: CampaignSnapshot = [];
  for (let start = 0; start < organizations.length; start += 8) {
    results.push(
      ...(await Promise.all(
        organizations
          .slice(start, start + 8)
          .map((org) => checkSource(org, previous.find((s) => s.organization === org.name), { useAi })),
      )),
    );
  }
  if (!results.some((s) => s.checked === s.attempted)) throw new Error("No directory could be refreshed");

  const allAlerts = results.flatMap((s) => s.alerts);
  const withRefs = allAlerts.filter((a) => a.references.length > 0).length;
  const withTitles = allAlerts.filter((a) => (a.billTitles?.length ?? 0) > 0).length;
  console.log("Directories checked:", results.filter((s) => s.checked === s.attempted).length, "/", results.length);
  console.log("Alerts found:", allAlerts.length, `(${withRefs} with refs, ${withTitles} with bill titles)`);

  if (db) {
    const items: ItemRow[] = [];
    let cursor = "";
    while (true) {
      const query = db.from("items").select("id,url,action_url,source,external_id,title,state").order("id").limit(500);
      if (cursor) query.gt("id", cursor);
      const { data, error } = await query;
      if (error) throw error;
      if (!data.length) break;
      items.push(...data);
      cursor = data[data.length - 1].id;
    }

    const pulled = await pullMissingCampaignBills(db, results, items);
    items.push(...pulled);
    console.log("On-demand bills pulled:", pulled.length);

    const alertByKey = new Map<string, Alert>();
    for (const source of results) {
      for (const alert of source.alerts) {
        delete alert.matchedItems;
        alertByKey.set(`${source.organization}|${alert.url}`, alert);
      }
    }

    let matched = 0;
    for (const item of items) {
      const alertHits = alertsForItem(results, item);
      const curatedHits = campaignsForItem(item.source, item.external_id, []).direct;
      if (alertHits.length || curatedHits.length) matched++;
      for (const hit of alertHits) {
        const target = alertByKey.get(`${hit.organization}|${hit.url}`);
        if (!target) continue;
        target.matchedItems ??= [];
        if (target.matchedItems.length < 3 && !target.matchedItems.some((m) => m.id === item.id)) {
          target.matchedItems.push({ id: item.id, title: item.title });
        }
      }
    }
    console.log(`Items checked: ${items.length}, matched: ${matched}`);

    const { error } = await db.from("campaign_snapshot").upsert({
      id: 1,
      sources: results,
      items_checked: items.length,
      items_matched: matched,
      checked_at: new Date().toISOString(),
    });
    if (error) throw error;
  } else {
    for (const source of results) {
      for (const alert of source.alerts) delete alert.matchedItems;
    }
    await writeFile(file, JSON.stringify(results, null, 2) + "\n");
  }
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
