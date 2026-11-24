/**
 * Merges near-duplicate facts. Items analyzed in the same batch can't see each other's new facts, and the
 * model's wording drifts ("rides_bart" vs "uses_bart"), so after each run one cheap call compares the facts
 * minted this run against existing ones on the same topics. Duplicates get `canonical_key`, and the impacts
 * and user answers that pointed at them are moved to the survivor. Cost scales with new facts, not users.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Database } from "@/lib/supabase/database.types";
import { anthropic, FAST_MODEL } from "@/lib/ai/client";
import { expandTopics } from "@/lib/taxonomy";
import type { Fact } from "@/lib/facts";
import type { Impact } from "@/lib/ai/analyze";

type DB = SupabaseClient<Database>;

const MergeSchema = z.object({
  merges: z
    .array(z.object({ duplicate: z.string(), canonical: z.string() }))
    .describe("Only pairs that ask the same thing about a person, so one answer would answer both"),
});

const SYSTEM = `You deduplicate yes/no and multiple-choice questions a civic app asks residents ("Do you ride BART?").
Two facts are duplicates only if a person's answer to one would always be the same answer to the other, with the same options.
"Do you ride BART?" and "Do you use BART?" are duplicates. "Do you ride BART?" and "Do you ride public transit?" are not (one is broader).
For each NEW fact that duplicates another fact, return {duplicate: <new key>, canonical: <other key>}. Prefer an EXISTING fact as canonical.
Return an empty list when nothing is a duplicate.`;

/** Pure validation of model-proposed merges, so a bad suggestion can't merge incompatible facts. */
export function validMerges(proposed: { duplicate: string; canonical: string }[], fresh: Set<string>, byKey: Map<string, Fact>) {
  const out = new Map<string, string>();
  for (const { duplicate, canonical } of proposed) {
    const d = byKey.get(duplicate);
    const c = byKey.get(canonical);
    if (!d || !c || d.key === c.key || !fresh.has(d.key) || out.has(d.key) || out.has(c.key)) continue;
    if (d.answer_type !== c.answer_type) continue;
    if (d.answer_type === "choice") {
      const opts = new Set(c.options.map((o) => o.toLowerCase()));
      if (!d.options.every((o) => opts.has(o.toLowerCase()))) continue;
    }
    out.set(d.key, c.key);
  }
  return out;
}

const describe = (f: Fact) => `- ${f.key} [${f.answer_type === "bool" ? "yes/no" : f.options.join(" | ")}]: ${f.question}`;

export async function consolidateFacts(db: DB, freshKeys: string[], log: (...m: unknown[]) => void): Promise<number> {
  if (!freshKeys.length) return 0;
  const { data, error } = await db.from("facts").select("key, question, you_phrase, answer_type, options, topics, facets, canonical_key").is("canonical_key", null);
  if (error) throw error;
  const all = (data ?? []) as Fact[];
  const byKey = new Map(all.map((f) => [f.key, f]));
  const fresh = all.filter((f) => freshKeys.includes(f.key));
  if (!fresh.length) return 0;

  const freshTopics = new Set(fresh.flatMap((f) => expandTopics(f.topics)));
  const existing = all.filter((f) => !freshKeys.includes(f.key) && expandTopics(f.topics).some((t) => freshTopics.has(t))).slice(0, 300);

  const res = await anthropic().messages.parse({
    model: FAST_MODEL,
    max_tokens: 4000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "low", format: zodOutputFormat(MergeSchema) },
    messages: [
      {
        role: "user",
        content: `NEW facts:\n${fresh.map(describe).join("\n")}\n\nEXISTING facts:\n${existing.map(describe).join("\n") || "(none)"}`,
      },
    ],
  });
  if (res.stop_reason !== "end_turn" || !res.parsed_output) {
    log("facts: consolidation skipped (no usable model output)");
    return 0;
  }

  const merges = validMerges(res.parsed_output.merges, new Set(freshKeys), byKey);
  for (const [dup, canon] of merges) await mergeFact(db, dup, canon);
  log(`facts: ${fresh.length} new, ${merges.size} merged into existing facts`);
  return merges.size;
}

/** Points everything at `canon`: the fact itself, impacts that reference `dup`, and users' answers. */
export async function mergeFact(db: DB, dup: string, canon: string) {
  await db.from("facts").update({ canonical_key: canon }).eq("key", dup);
  await db.from("facts").update({ canonical_key: canon }).eq("canonical_key", dup);

  // A string, so postgrest sends it as JSON (an array would become a Postgres array literal).
  const { data: rows, error } = await db
    .from("item_analysis")
    .select("item_id, impacts")
    .contains("impacts", JSON.stringify([{ applies_if: { fact_key: dup } }]));
  if (error) throw error;
  for (const r of rows ?? []) {
    const impacts = (r.impacts as unknown as Impact[]).map((i) =>
      i.applies_if?.fact_key === dup ? { ...i, applies_if: { ...i.applies_if, fact_key: canon } } : i,
    );
    await db.from("item_analysis").update({ impacts }).eq("item_id", r.item_id);
  }

  // Keep a user's existing answer to the canonical fact; otherwise carry the duplicate's answer over.
  const { data: answers } = await db.from("user_facts").select("*").eq("fact_key", dup);
  for (const a of answers ?? []) {
    await db.from("user_facts").upsert({ ...a, fact_key: canon }, { onConflict: "user_id,fact_key", ignoreDuplicates: true });
  }
  await db.from("user_facts").delete().eq("fact_key", dup);
}
