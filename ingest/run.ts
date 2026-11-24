/**
 * Nightly ingestion. Idempotent: safe to re-run any time.
 *
 *   npm run ingest                         # everything
 *   npm run ingest -- --only=federalregister,analyze --limit=20 --wait
 *   npm run ingest -- --only=analyze --reanalyze --wait   # re-run active items analyzed by an older prompt
 *   npm run ingest -- --only=openstates,legistar,analyze --new-areas-only --wait   # just backfill new areas
 *
 * Areas are pulled in on demand: state bills only for states where users live, council items for cities in
 * legistar.config.ts. The first time a state or city is ingested it is backfilled (BACKFILL_DAYS of history)
 * and recorded in ingest_coverage; after that it gets the usual short lookback. Saving a ZIP in an area
 * that isn't covered yet triggers .github/workflows/backfill.yml (lib/coverage.ts).
 *
 * Steps: officials → items from each source → collect finished analysis batches
 *        → escalate important items to the writer model → submit new items for analysis.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchFederalOfficials, type OfficialRow } from "@/lib/civic/officials";
import { aiConfigured, FAST_MODEL, WRITER_MODEL } from "@/lib/ai/client";
import { collectAnalysisBatch, PROMPT_VERSION, submitAnalysisBatch, type AnalyzableItem } from "@/lib/ai/analyze";
import { HEURISTIC_VERSION, heuristicAnalysis } from "@/lib/ai/heuristic";
import type { Fact, Registry } from "@/lib/facts";
import { consolidateFacts } from "./consolidateFacts";
import { contentHash, type NormalizedItem } from "./normalize";
import { fetchOpenCommentPeriods } from "./federalRegister";
import { fetchBillDetail, fetchUpdatedBills, normalizeCongressBill } from "./congress";
import { fetchStateBills } from "./openstates";
import { fetchCityMatters, fetchCouncilMembers } from "./legistar";
import { citySourceScope, LOCAL_SOURCES, stateScope } from "./legistar.config";
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
const REANALYZE = args.reanalyze === "true";
const NEW_AREAS_ONLY = args["new-areas-only"] === "true";
const since = new Date(Date.now() - SINCE_DAYS * 86_400_000);
// A new state's first fetch reaches back as far as the feed shows inactive items (feed_candidates: 45 days).
const BACKFILL_DAYS = 45;
const BACKFILL_PAGES = 15; // × 20 bills, most recently updated first; Open States' free tier is ~10 req/min
const should = (step: string) => !ONLY || ONLY.has(step);

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const log = (...m: unknown[]) => console.log(`[ingest ${new Date().toISOString().slice(11, 19)}]`, ...m);
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * Updates items by id. Ids go in the URL's query string, and a few hundred uuids overflow it ("URI too long"),
 * so this goes 100 at a time and throws rather than silently leaving items in the wrong state.
 */
async function updateItems(patch: Database["public"]["Tables"]["items"]["Update"], ids: string[]) {
  for (const c of chunk(ids, 100)) {
    const { error } = await db.from("items").update(patch).in("id", c);
    if (error) throw error;
  }
}

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
    // Ids go in the query string; Open States ids are ~50 chars, so look them up 100 at a time.
    const prev = new Map<string, string>();
    for (const ids of chunk(c.map((i) => i.external_id), 100)) {
      const { data: existing, error: exErr } = await db
        .from("items")
        .select("external_id, content_hash")
        .eq("source", source)
        .in("external_id", ids);
      if (exErr) throw exErr;
      for (const e of existing) prev.set(e.external_id, e.content_hash);
    }

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
      const knownIds = new Set<string>();
      for (const ids of chunk([...new Set(links.map((l) => l.official_id))], 100)) {
        const { data: known } = await db.from("officials").select("id").in("id", ids);
        for (const k of known ?? []) knownIds.add(k.id);
      }
      const valid = links.filter((l) => l.item_id && knownIds.has(l.official_id));
      if (valid.length) {
        const { error } = await db.from("item_officials").upsert(valid, { onConflict: "item_id,official_id,role", ignoreDuplicates: true });
        if (error) throw error;
      }
    }
  }
  return changedCount;
}

/** Fetches and saves one source; `step` is its --only name. Returns null on success, else why it didn't run. */
async function runSource(name: string, fn: () => Promise<NormalizedItem[]>, step = name): Promise<string | null> {
  if (!should(step)) return "skipped";
  try {
    let items = await fn();
    if (LIMIT) items = items.slice(0, LIMIT);
    const changed = await upsertItems(items);
    log(`${name}: ${items.length} items (${changed} new or changed)`);
    return null;
  } catch (err) {
    // One failing source shouldn't stop the others.
    // Supabase errors are plain objects with a message, not Error instances.
    const message = err instanceof Error ? err.message : ((err as { message?: string })?.message ?? JSON.stringify(err));
    console.error(`${name} failed:`, message);
    process.exitCode = 1;
    return message;
  }
}

// ---------------------------------------------------------------- areas (on demand)

/** Which of these coverage scopes have been backfilled. Null if ingest_coverage is unavailable. */
async function loadCovered(scopes: string[]): Promise<Set<string> | null> {
  const { data, error } = await db.from("ingest_coverage").select("scope").in("scope", scopes).not("backfilled_at", "is", null);
  if (error) {
    // e.g. the ingest_coverage migration isn't applied yet: carry on without backfilling.
    console.error("ingest_coverage unavailable, skipping backfills:", error.message);
    return null;
  }
  return new Set(data.map((c) => c.scope));
}

async function recordBackfill(scope: string, failure: string | null) {
  // A --limit run is partial, so it doesn't count as a backfill.
  if (LIMIT && !failure) return;
  const { error } = await db
    .from("ingest_coverage")
    .upsert(
      failure ? { scope, last_error: failure.slice(0, 500) } : { scope, backfilled_at: new Date().toISOString(), last_error: null },
      { onConflict: "scope" },
    );
  if (error) console.error(`coverage ${scope}:`, error.message);
}

const backfillSince = () => new Date(Date.now() - BACKFILL_DAYS * 86_400_000);

/** State bills for every state a user lives in; states seen for the first time get a deeper backfill. */
async function ingestStates() {
  if (!should("openstates")) return;
  const { data: profiles } = await db.from("profiles").select("state").not("state", "is", null);
  const states = [...new Set((profiles ?? []).map((p) => p.state!))].sort();
  const covered = await loadCovered(states.map(stateScope));
  if (!covered && NEW_AREAS_ONLY) return;

  for (const st of states) {
    const isNew = !!covered && !covered.has(stateScope(st));
    if (NEW_AREAS_ONLY && !isNew) continue;
    const failure = await runSource(
      `openstates ${st}${isNew ? " (backfill)" : ""}`,
      () => fetchStateBills(st, isNew ? backfillSince() : since, isNew ? { maxPages: BACKFILL_PAGES, by: "action" } : {}),
      "openstates",
    );
    // Without a key nothing was fetched: not a backfill.
    if (isNew && process.env.OPENSTATES_API_KEY) await recordBackfill(stateScope(st), failure);
  }
}

/** Council items for each configured Legistar city; a city's first run backfills BACKFILL_DAYS. */
async function ingestCities() {
  if (!should("legistar")) return;
  const covered = await loadCovered(LOCAL_SOURCES.map(citySourceScope));
  if (!covered && NEW_AREAS_ONLY) return;
  for (const src of LOCAL_SOURCES) {
    const isNew = !!covered && !covered.has(citySourceScope(src));
    if (NEW_AREAS_ONLY && !isNew) continue;
    const failure = await runSource(
      `legistar ${src.client}${isNew ? " (backfill)" : ""}`,
      () => fetchCityMatters(src, isNew ? backfillSince() : since),
      "legistar",
    );
    if (isNew) await recordBackfill(citySourceScope(src), failure);
  }
}

// ---------------------------------------------------------------- analysis

const usage: UsageTotals = {};

/** The fact registry (including merged aliases), loaded once per run and extended as facts are minted. */
const registry: Registry = new Map();
const freshFacts: string[] = [];

async function loadRegistry() {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("facts")
      .select("key, question, you_phrase, answer_type, options, topics, facets, canonical_key")
      .range(from, from + 999);
    if (error) throw error;
    for (const f of data as Fact[]) registry.set(f.key, f);
    if (data.length < 1000) break;
  }
  log(`facts: ${registry.size} in registry`);
}

async function saveNewFacts(results: { itemId: string; newFacts: Fact[] }[]) {
  const rows = results.flatMap((r) =>
    r.newFacts
      .filter((f) => !registry.has(f.key))
      .map(({ canonical_key: _c, ...f }) => ({ ...f, source: "ai", created_from_item: r.itemId })),
  );
  const unique = [...new Map(rows.map((r) => [r.key, r])).values()];
  if (!unique.length) return;
  const { error } = await db.from("facts").upsert(unique, { onConflict: "key", ignoreDuplicates: true });
  if (error) throw error;
  for (const f of unique) {
    registry.set(f.key, { ...f, canonical_key: null });
    freshFacts.push(f.key);
  }
}

async function collectBatches() {
  const { data: pending, error } = await db
    .from("items")
    .select("analysis_batch_id")
    .eq("analysis_status", "submitted")
    .not("analysis_batch_id", "is", null);
  if (error) throw error;
  const batchIds = [...new Set(pending.map((p) => p.analysis_batch_id!))];

  for (const batchId of batchIds) {
    let outcome = await collectAnalysisBatch(batchId, registry);
    while (WAIT && outcome.status === "processing") {
      log(`batch ${batchId} still processing…`);
      await new Promise((r) => setTimeout(r, 30_000));
      outcome = await collectAnalysisBatch(batchId, registry);
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

    // Facts first: impacts reference them.
    await saveNewFacts(ok);
    for (const c of chunk(ok, 500)) {
      const { error: upErr } = await db.from("item_analysis").upsert(
        c.map((r) => ({
          item_id: r.itemId,
          ...r.analysis!,
          model: r.model,
          prompt_version: PROMPT_VERSION,
          created_at: new Date().toISOString(),
        })),
        { onConflict: "item_id" },
      );
      if (upErr) throw upErr;
      await updateItems({ analysis_status: "done", analysis_batch_id: null }, c.map((r) => r.itemId));
    }
    // Failed items: keep any earlier analysis (e.g. an escalation failed), otherwise mark failed.
    for (const c of chunk(failed, 100)) {
      const { data: had } = await db.from("item_analysis").select("item_id").in("item_id", c);
      const hadSet = new Set((had ?? []).map((h) => h.item_id));
      const withPrev = c.filter((id) => hadSet.has(id));
      const without = c.filter((id) => !hadSet.has(id));
      await updateItems({ analysis_status: "done", analysis_batch_id: null }, withPrev);
      await updateItems({ analysis_status: "failed", analysis_batch_id: null }, without);
    }
    log(`batch ${batchId}: ${ok.length} analyzed, ${failed.length} failed`);
  }
}

const ANALYZE_COLUMNS = "id, type, level, state, title, description, agency, status, last_action, comment_deadline";

async function submitBatch(items: AnalyzableItem[], model: string, label: string) {
  if (!items.length) return;
  const facts = [...registry.values()].filter((f) => !f.canonical_key);
  const batchId = await submitAnalysisBatch(items, model, facts);
  await updateItems({ analysis_status: "submitted", analysis_batch_id: batchId }, items.map((i) => i.id));
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

/**
 * After a prompt change (e.g. analyze-v2 added headlines and impacts), queue still-active items whose
 * analysis came from an older prompt. Only items users can still act on, so the one-time cost stays bounded.
 */
async function requeueStale() {
  const today = new Date().toISOString().slice(0, 10);
  const recent = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("item_analysis")
    .select("item_id, items!inner(analysis_status, comment_deadline, event_at, last_action_at)")
    .neq("prompt_version", PROMPT_VERSION)
    .neq("model", "heuristic")
    .eq("items.analysis_status", "done")
    .or(`comment_deadline.gt.${today},event_at.gt.${today},last_action_at.gt.${recent}`, { referencedTable: "items" })
    .limit(LIMIT ?? 10_000);
  if (error) throw error;
  await updateItems({ analysis_status: "pending" }, data.map((d) => d.item_id));
  log(`reanalyze: queued ${data.length} active items analyzed with an older prompt`);
}

/** No API key: tag pending items with keyword rules so the feed still works. They stay `pending`. */
async function heuristicPending() {
  const { data, error } = await db
    .from("items")
    .select("id, title, description, agency, item_analysis(prompt_version)")
    .eq("analysis_status", "pending")
    .limit(LIMIT ?? 10_000);
  if (error) throw error;
  // New items, plus ones tagged by an older version of the rules.
  const fresh = data
    .filter((d) => !d.item_analysis || d.item_analysis.prompt_version !== HEURISTIC_VERSION)
    .map(({ item_analysis: _a, ...i }) => i);
  for (const c of chunk(fresh, 500)) {
    const { error: upErr } = await db.from("item_analysis").upsert(
      c.map((i) => ({ item_id: i.id, ...heuristicAnalysis(i), model: "heuristic", prompt_version: HEURISTIC_VERSION })),
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

  await ingestStates();

  await ingestCities();

  if (should("analyze")) {
    if (!aiConfigured()) {
      await heuristicPending();
    } else {
      await loadRegistry();
      await collectBatches();
      if (REANALYZE) await requeueStale();
      await escalate();
      await submitPending();
      if (WAIT) await collectBatches();
      // Facts minted this run, plus any the "Ask about my situation" agent minted since the last run.
      const { data: agentFacts } = await db
        .from("facts")
        .select("key")
        .eq("source", "agent")
        .is("canonical_key", null)
        .gte("created_at", since.toISOString());
      await consolidateFacts(db, [...new Set([...freshFacts, ...(agentFacts ?? []).map((f) => f.key)])], log);
      const cost = estimateCost(usage);
      if (cost.lines.length) log(`token usage:\n${cost.lines.join("\n")}\n  total ≈ $${cost.total.toFixed(4)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
