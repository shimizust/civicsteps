/**
 * Nightly ingestion. Idempotent: safe to re-run any time.
 *
 *   npm run ingest                         # everything
 *   npm run ingest -- --only=federalregister,analyze --limit=20 --wait
 *
 * Steps: officials → items from each source → collect finished analysis batches
 *        → escalate important items to the writer model → submit new items for analysis.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchFederalOfficials, type OfficialRow } from "@/lib/civic/officials";
import { aiConfigured, FAST_MODEL, WRITER_MODEL } from "@/lib/ai/client";
import { collectAnalysisBatch, PROMPT_VERSION, submitAnalysisBatch, type AnalyzableItem } from "@/lib/ai/analyze";
import { heuristicAnalysis } from "@/lib/ai/heuristic";
import { contentHash, type NormalizedItem } from "./normalize";
import { fetchOpenCommentPeriods } from "./federalRegister";
import { fetchBillDetail, fetchUpdatedBills, normalizeCongressBill } from "./congress";
import { fetchStateBills } from "./openstates";
import { fetchCityMatters, fetchCouncilMembers } from "./legistar";
import { LOCAL_SOURCES } from "./legistar.config";
import { estimateCost, type UsageTotals } from "./cost";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const ONLY = args.only ? new Set(args.only.split(",")) : null;
const LIMIT = args.limit ? parseInt(args.limit, 10) : undefined;
const SINCE_DAYS = parseFloat(args["since-days"] ?? "2");
const WAIT = args.wait === "true";
const since = new Date(Date.now() - SINCE_DAYS * 86_400_000);
const should = (step: string) => !ONLY || ONLY.has(step);

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const log = (...m: unknown[]) => console.log(`[ingest ${new Date().toISOString().slice(11, 19)}]`, ...m);
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

async function upsertOfficials(rows: OfficialRow[]) {
  for (const c of chunk(rows, 500)) {
    const { error } = await db.from("officials").upsert(c, { onConflict: "id" });
    if (error) throw error;
  }
}

/** Upserts items; resets analysis only when analysis-relevant content changed. Returns count of new/changed. */
async function upsertItems(items: NormalizedItem[]): Promise<number> {
  if (!items.length) return 0;
  // de-dupe within the batch (APIs sometimes return the same record twice across pages)
  const unique = [...new Map(items.map((i) => [`${i.source}|${i.external_id}`, i])).values()];
  let changedCount = 0;

  for (const c of chunk(unique, 500)) {
    const source = c[0].source;
    const { data: existing, error: exErr } = await db
      .from("items")
      .select("external_id, content_hash")
      .eq("source", source)
      .in("external_id", c.map((i) => i.external_id));
    if (exErr) throw exErr;
    const prev = new Map(existing.map((e) => [e.external_id, e.content_hash]));

    const rows = c.map(({ officials: _officials, ...rest }) => ({ ...rest, content_hash: contentHash(rest) }));
    const changed = rows.filter((r) => prev.get(r.external_id) !== r.content_hash);
    const unchanged = rows.filter((r) => prev.get(r.external_id) === r.content_hash);
    changedCount += changed.length;

    const results: { id: string; source: string; external_id: string }[] = [];
    if (changed.length) {
      const { data, error } = await db
        .from("items")
        .upsert(changed.map((r) => ({ ...r, analysis_status: "pending", analysis_batch_id: null })), { onConflict: "source,external_id" })
        .select("id, source, external_id");
      if (error) throw error;
      results.push(...data);
    }
    if (unchanged.length) {
      const { data, error } = await db
        .from("items")
        .upsert(unchanged, { onConflict: "source,external_id" })
        .select("id, source, external_id");
      if (error) throw error;
      results.push(...data);
    }

    // Link sponsors etc. — only to officials we know about (FK).
    const idByExt = new Map(results.map((r) => [r.external_id, r.id]));
    const links = c.flatMap((i) => (i.officials ?? []).map((o) => ({ item_id: idByExt.get(i.external_id)!, ...o })));
    if (links.length) {
      const { data: known } = await db.from("officials").select("id").in("id", [...new Set(links.map((l) => l.official_id))]);
      const knownIds = new Set((known ?? []).map((k) => k.id));
      const valid = links.filter((l) => l.item_id && knownIds.has(l.official_id));
      if (valid.length) {
        const { error } = await db.from("item_officials").upsert(valid, { onConflict: "item_id,official_id,role", ignoreDuplicates: true });
        if (error) throw error;
      }
    }
  }
  return changedCount;
}

async function runSource(name: string, fn: () => Promise<NormalizedItem[]>) {
  if (!should(name)) return;
  try {
    let items = await fn();
    if (LIMIT) items = items.slice(0, LIMIT);
    const changed = await upsertItems(items);
    log(`${name}: ${items.length} items (${changed} new or changed)`);
  } catch (err) {
    // One failing source shouldn't stop the others.
    console.error(`${name} failed:`, err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------- analysis

const usage: UsageTotals = {};

async function collectBatches() {
  const { data: pending, error } = await db
    .from("items")
    .select("analysis_batch_id")
    .eq("analysis_status", "submitted")
    .not("analysis_batch_id", "is", null);
  if (error) throw error;
  const batchIds = [...new Set(pending.map((p) => p.analysis_batch_id!))];

  for (const batchId of batchIds) {
    let outcome = await collectAnalysisBatch(batchId);
    while (WAIT && outcome.status === "processing") {
      log(`batch ${batchId} still processing…`);
      await new Promise((r) => setTimeout(r, 30_000));
      outcome = await collectAnalysisBatch(batchId);
    }
    if (outcome.status === "processing") {
      log(`batch ${batchId} still processing; will collect next run`);
      continue;
    }
    const ok = outcome.results.filter((r) => r.analysis);
    const failed = outcome.results.filter((r) => !r.analysis).map((r) => r.itemId);
    for (const r of outcome.results) {
      if (!r.usage) continue;
      const u = (usage[r.model] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, batch: true });
      u.input += r.usage.input_tokens;
      u.output += r.usage.output_tokens;
      u.cacheRead += r.usage.cache_read_input_tokens ?? 0;
      u.cacheWrite += r.usage.cache_creation_input_tokens ?? 0;
    }

    for (const c of chunk(ok, 500)) {
      const { error: upErr } = await db.from("item_analysis").upsert(
        c.map((r) => ({ item_id: r.itemId, ...r.analysis!, model: r.model, prompt_version: PROMPT_VERSION, created_at: new Date().toISOString() })),
        { onConflict: "item_id" },
      );
      if (upErr) throw upErr;
      await db.from("items").update({ analysis_status: "done", analysis_batch_id: null }).in("id", c.map((r) => r.itemId));
    }
    // Failed items: keep any earlier analysis (e.g. an escalation failed), otherwise mark failed.
    for (const c of chunk(failed, 500)) {
      const { data: had } = await db.from("item_analysis").select("item_id").in("item_id", c);
      const hadSet = new Set((had ?? []).map((h) => h.item_id));
      const withPrev = c.filter((id) => hadSet.has(id));
      const without = c.filter((id) => !hadSet.has(id));
      if (withPrev.length) await db.from("items").update({ analysis_status: "done", analysis_batch_id: null }).in("id", withPrev);
      if (without.length) await db.from("items").update({ analysis_status: "failed", analysis_batch_id: null }).in("id", without);
    }
    log(`batch ${batchId}: ${ok.length} analyzed, ${failed.length} failed`);
  }
}

const ANALYZE_COLUMNS = "id, type, level, state, title, description, agency, status, last_action, comment_deadline";

async function submitBatch(items: AnalyzableItem[], model: string, label: string) {
  if (!items.length) return;
  const batchId = await submitAnalysisBatch(items, model);
  for (const c of chunk(items.map((i) => i.id), 500)) {
    await db.from("items").update({ analysis_status: "submitted", analysis_batch_id: batchId }).in("id", c);
  }
  log(`${label}: submitted ${items.length} items to ${model} (batch ${batchId})`);
}

async function submitPending() {
  const { data, error } = await db
    .from("items")
    .select(ANALYZE_COLUMNS)
    .eq("analysis_status", "pending")
    .order("updated_at", { ascending: false })
    .limit(LIMIT ?? 10_000);
  if (error) throw error;
  await submitBatch(data, FAST_MODEL, "analysis");
}

/** Important items, and anything matching a user's pet issue, get a better summary from the writer model. */
async function escalate() {
  if (FAST_MODEL === WRITER_MODEL) return;
  const { data: candidates, error } = await db
    .from("item_analysis")
    .select(`item_id, significance, keywords, items!inner(${ANALYZE_COLUMNS}, analysis_status)`)
    .eq("model", FAST_MODEL)
    .eq("items.analysis_status", "done")
    .limit(5000);
  if (error) throw error;

  const { data: pets } = await db.from("user_interests").select("keywords").eq("is_pet", true);
  const petKeywords = [...new Set((pets ?? []).flatMap((p) => p.keywords.map((k) => k.toLowerCase())))].filter((k) => k.length > 3);

  const picked = candidates.filter((c) => {
    if (c.significance >= 4) return true;
    const hay = `${c.items.title} ${c.keywords.join(" ")}`.toLowerCase();
    return petKeywords.some((k) => hay.includes(k));
  });
  const items = picked.slice(0, LIMIT ?? 2000).map(({ items: { analysis_status: _s, ...item } }) => item);
  await submitBatch(items, WRITER_MODEL, "escalation");
}

/** No API key: tag pending items with keyword rules so the feed still works. They stay `pending`. */
async function heuristicPending() {
  const { data, error } = await db
    .from("items")
    .select("id, title, description, agency, item_analysis(item_id)")
    .eq("analysis_status", "pending")
    .limit(LIMIT ?? 10_000);
  if (error) throw error;
  const fresh = data.filter((d) => !d.item_analysis);
  for (const c of chunk(fresh, 500)) {
    const { error: upErr } = await db.from("item_analysis").upsert(
      c.map((i) => ({ item_id: i.id, ...heuristicAnalysis(i), model: "heuristic", prompt_version: "heuristic-v1" })),
      { onConflict: "item_id" },
    );
    if (upErr) throw upErr;
  }
  log(`analyze: no ANTHROPIC_API_KEY — tagged ${fresh.length} items with keyword rules (they'll get AI analysis once a key is set)`);
}

// ---------------------------------------------------------------- main

async function main() {
  log(`since ${since.toISOString()}${LIMIT ? `, limit ${LIMIT}` : ""}${ONLY ? `, only ${[...ONLY].join(",")}` : ""}`);

  if (should("officials")) {
    const fed = await fetchFederalOfficials();
    await upsertOfficials(fed);
    log(`officials: ${fed.length} federal`);
    for (const src of LOCAL_SOURCES) {
      try {
        const council = await fetchCouncilMembers(src);
        await upsertOfficials(council);
        log(`officials: ${council.length} ${src.name} council`);
      } catch (err) {
        console.error(`council ${src.client} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  await runSource("federalregister", () => fetchOpenCommentPeriods());

  await runSource("congress", async () => {
    const bills = await fetchUpdatedBills(since, LIMIT ?? 500);
    const { data: existing } = await db
      .from("items")
      .select("external_id, description")
      .eq("source", "congress")
      .in("external_id", bills.map((b) => `${b.congress}-${b.type}-${b.number}`));
    const known = new Map((existing ?? []).map((e) => [e.external_id, e.description]));
    const out: NormalizedItem[] = [];
    for (const b of bills) {
      const id = `${b.congress}-${b.type}-${b.number}`;
      // Detail calls (CRS summary + sponsor) for new bills only; status updates come from the list call.
      // Known bills keep their stored summary so the content hash (and analysis) stays stable.
      const detail = known.has(id) ? { summary: known.get(id) ?? null, sponsors: [] } : await fetchBillDetail(b).catch(() => undefined);
      out.push(normalizeCongressBill(b, detail));
    }
    return out;
  });

  await runSource("openstates", async () => {
    const { data } = await db.from("profiles").select("state").not("state", "is", null);
    const states = [...new Set((data ?? []).map((p) => p.state!))];
    const all: NormalizedItem[] = [];
    for (const st of states) all.push(...(await fetchStateBills(st, since)));
    return all;
  });

  await runSource("legistar", async () => {
    const all: NormalizedItem[] = [];
    for (const src of LOCAL_SOURCES) all.push(...(await fetchCityMatters(src, since)));
    return all;
  });

  if (should("analyze")) {
    if (!aiConfigured()) {
      await heuristicPending();
    } else {
      await collectBatches();
      await escalate();
      await submitPending();
      if (WAIT) await collectBatches();
      const cost = estimateCost(usage);
      if (cost.lines.length) log(`token usage:\n${cost.lines.join("\n")}\n  total ≈ $${cost.total.toFixed(4)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
