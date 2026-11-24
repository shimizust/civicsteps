/**
 * Per-item analysis: plain-language summary, topic tags, affected groups, significance and
 * neutral arguments. Runs once per item (not per user) through the Message Batches API at 50% off.
 * Topics and groups are constrained to the taxonomy via structured outputs, so matching
 * to users is plain SQL afterwards.
 *
 * analyze-v3: an impact can name the specific fact that decides whether it reaches someone
 * ("Do you ride BART?"). The model sees the existing fact registry for the item's topics and reuses
 * keys where it can, minting new facts only when nothing fits (lib/facts.ts, ingest/consolidateFacts.ts).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AFFECTED_GROUP_SLUGS, FACETS, FACET_SLUGS, TOPICS } from "@/lib/taxonomy";
import { factsForPrompt, formatFactsForPrompt, normalizeFactKey, resolveKey, type Fact, type Registry } from "@/lib/facts";
import { anthropic, FAST_MODEL } from "./client";
import { heuristicAnalysis } from "./heuristic";

export const PROMPT_VERSION = "analyze-v3";

const topicSlugs = TOPICS.map((t) => t.slug) as [string, ...string[]];
const groupSlugs = AFFECTED_GROUP_SLUGS as [string, ...string[]];

export const ImpactSchema = z.object({
  facet: z.enum(FACET_SLUGS as [string, ...string[]]),
  magnitude: z.number().int().describe("1 = minor or indirect, 2 = noticeable, 3 = major, direct change to daily life or money"),
  direction: z
    .enum(["benefit", "cost", "mixed"])
    .describe("For the people in `groups` (or the general public if empty). 'mixed' unless the text directly supports a concrete gain or loss."),
  groups: z.array(z.enum(groupSlugs)).describe("Who feels this most; empty if broadly everyone"),
  note: z.string().describe("One factual clause, max 15 words, e.g. 'Raises park entry fees by $5'"),
  applies_if: z
    .object({
      fact_key: z.string().describe("A key from the existing facts list, or from your new_facts"),
      when: z.array(z.string()).describe("Answers that put someone in the affected set: ['yes'] or ['no'] for yes/no facts, else option labels"),
    })
    .nullable()
    .describe("Set when the impact falls on users, visitors, customers or payers of something specific and named; null when it reaches a whole group or everyone"),
});
export type Impact = z.infer<typeof ImpactSchema>;

export const NewFactSchema = z.object({
  key: z.string().describe("snake_case, specific and reusable across items, e.g. 'rides_bart', 'climbs_indian_creek', 'owns_ev'"),
  question: z.string().describe("Short question a resident answers in one tap, e.g. 'Do you ride BART?'"),
  you_phrase: z.string().describe("Second person completion of 'Applies to you because …', e.g. 'you ride BART'"),
  answer_type: z.enum(["bool", "choice"]).describe("Prefer 'bool' (yes/no)"),
  options: z.array(z.string()).describe("2-5 short option labels for 'choice'; empty for 'bool'"),
  topics: z.array(z.enum(topicSlugs)).describe("1-3 topic slugs where this fact is likely to matter again"),
  facets: z.array(z.enum(FACET_SLUGS as [string, ...string[]])),
});
export type NewFact = z.infer<typeof NewFactSchema>;

export const AnalysisSchema = z.object({
  headline: z
    .string()
    .describe("Max 12 words. Plain verb phrase saying what this does, no jargon or bill numbers, e.g. 'Lets climbers keep fixed anchors in wilderness areas'"),
  summary: z.string().describe("2-3 sentence plain-language summary a non-expert can follow. Neutral tone."),
  why_it_matters: z.string().describe("One sentence on who it affects in practice and how."),
  topics: z.array(z.enum(topicSlugs)).describe("1-4 most specific matching topic slugs"),
  affected_groups: z.array(z.enum(groupSlugs)),
  impacts: z.array(ImpactSchema).describe("0-4 areas of life this concretely changes, most important first"),
  keywords: z
    .array(z.string())
    .describe("3-8 lowercase specific keywords: places, programs, agencies, species, parks (e.g. 'joshua tree', 'bolting')"),
  significance: z
    .number()
    .int()
    .describe("1 = routine/ceremonial (renaming a post office), 3 = notable, 5 = major change affecting many people"),
  arguments_for: z.array(z.string()).describe("1-3 short points supporters make"),
  arguments_against: z.array(z.string()).describe("1-3 short points opponents make"),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

/** What the model returns: the stored analysis plus any facts it had to mint. */
export const AnalysisOutputSchema = AnalysisSchema.extend({
  new_facts: z
    .array(NewFactSchema)
    .describe("Facts referenced by applies_if that are not in the existing list. Usually empty: reuse existing facts whenever one fits."),
});
export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

const taxonomyText = TOPICS.map((t) => `- ${t.slug}: ${t.name}`).join("\n");
const facetText = Object.entries(FACETS).map(([k, f]) => `- ${k}: ${f.label} (${f.description})`).join("\n");

// Stable across every request so it caches.
const SYSTEM = `You analyze U.S. government items (bills, proposed rules open for public comment, hearings, council agenda items) for a nonpartisan civic engagement app.

Write for a busy resident with no policy background. Be strictly neutral: describe what the item does, not whether it is good. Present arguments for and against fairly and with equal care. Never guess at facts the item text does not support; if the text is thin (e.g. only a title), keep the summary short and say what is known.

Significance reflects real-world impact, not political attention. Ceremonial resolutions, commemorations and naming bills are 1. Technical corrections are 1-2.

Impacts describe how the item would change people's lives across these areas:
${facetText}
- Only include areas with a real, concrete effect; most items touch 1-2. Ceremonial and purely procedural items get none.
- Direction is from the point of view of the listed groups, not society as a whole: a fee increase is a "cost" for visitors even if it funds something good. Use "mixed" when the effect cuts both ways, depends on implementation, or the text doesn't say.
- Never judge moral, religious or ideological questions. For "rights" always use "mixed" and describe what is at stake, neutrally.
- Notes state facts from the text (amounts, dates, who), never opinions.

Specific facts ("applies_if"):
- Groups are broad ("transit riders"). Whenever an impact falls on the people who use, visit, pay for or are customers of something specific and named, also set applies_if to a yes/no fact that picks them out, and keep groups too. Examples:
  - fare change on the Seattle Center Monorail → rides_seattle_monorail ("Do you ride the Seattle Monorail?")
  - BART service cuts → rides_bart ("Do you ride BART?")
  - Seattle City Light rates or bonds → seattle_city_light_customer ("Is Seattle City Light your electric utility?")
  - commercial parking tax → pays_for_parking_downtown ("Do you regularly pay for parking in commercial lots or garages?")
  - rules or species protections at Crater Lake → visits_crater_lake ("Do you visit Crater Lake National Park?")
  - fixed anchors at a named crag → climbs_indian_creek ("Do you climb at Indian Creek?")
  - funding for public K-12 schools → has_kids_in_public_school ("Do you have kids in public K-12 school?")
  - EV tax credit → owns_or_plans_ev ("Do you own or plan to buy an electric vehicle?")
- Leave applies_if null when the impact reaches a whole group or everyone in the jurisdiction (an income tax change, a statewide minimum wage). Users only see items for where they live, so never mint a fact that just restates a group plus the place ("rents in Seattle" is just the renters group).
- Each item lists the existing facts for its topics. Reuse one whenever it asks the same thing, even if you'd word it differently. Mint a new fact (in new_facts) only when none fits, and make it reusable for future items (name the place or program, not the bill).
- Facts must be concrete, stable and answerable in one tap. Prefer yes/no.
- Never mint facts about religion, immigration or citizenship status, health conditions, sexuality or gender identity, political affiliation, or anything illegal. Use groups for those, or nothing.

Topic slugs (use only these, prefer the most specific child):
${taxonomyText}`;

export type AnalyzableItem = {
  id: string;
  type: string;
  level: string;
  state: string | null;
  title: string;
  description: string | null;
  agency: string | null;
  status: string | null;
  last_action: string | null;
  comment_deadline: string | null;
};

export function itemPrompt(item: AnalyzableItem): string {
  const lines = [
    `Type: ${item.type.replace("_", " ")}`,
    `Level: ${item.level}${item.state ? ` (${item.state})` : ""}`,
    item.agency && `Agency/body: ${item.agency}`,
    `Title: ${item.title}`,
    item.status && `Status: ${item.status}`,
    item.last_action && `Latest action: ${item.last_action}`,
    item.comment_deadline && `Public comment deadline: ${item.comment_deadline}`,
    item.description && `\nDescription:\n${item.description}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** The item plus the existing facts it may reference. Kept out of the cached system prompt because it varies. */
export function itemPromptWithFacts(item: AnalyzableItem, facts: Fact[]): string {
  const relevant = factsForPrompt(facts, heuristicAnalysis(item).topics);
  return `${itemPrompt(item)}\n\nExisting facts (reuse these keys when one fits):\n${formatFactsForPrompt(relevant)}`;
}

export function analysisParams(item: AnalyzableItem, model = FAST_MODEL, facts: Fact[] = []): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 4000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: model === FAST_MODEL ? "low" : "medium", format: zodOutputFormat(AnalysisOutputSchema) },
    messages: [{ role: "user", content: itemPromptWithFacts(item, facts) }],
  };
}

type FactShape = Pick<Fact, "answer_type" | "options">;

/** Answers in `when` that are valid for the fact, lowercased; empty if none are. */
function validWhen(when: string[], f: FactShape): string[] {
  const allowed = f.answer_type === "bool" ? ["yes", "no"] : f.options.map((o) => o.toLowerCase());
  return [...new Set(when.map((w) => w.toLowerCase().trim()))].filter((w) => allowed.includes(w));
}

/**
 * `known` holds the facts an applies_if may point at (registry + this item's new facts). Without it,
 * every applies_if is dropped, which is what the keyword fallback and older callers want.
 */
export function normalizeImpacts(impacts: Impact[], known?: Registry): Impact[] {
  const seen = new Set<string>();
  return impacts
    .filter((i) => FACET_SLUGS.includes(i.facet as never) && !seen.has(i.facet) && seen.add(i.facet))
    .map((i) => ({
      ...i,
      magnitude: Math.min(3, Math.max(1, Math.round(i.magnitude))),
      direction: i.facet === "rights" ? "mixed" : i.direction,
      groups: [...new Set(i.groups)].filter((g) => AFFECTED_GROUP_SLUGS.includes(g as never)),
      note: i.note.trim(),
      applies_if: normalizeAppliesIf(i.applies_if ?? null, known),
    }))
    .slice(0, 4);
}

function normalizeAppliesIf(a: Impact["applies_if"], known?: Registry): Impact["applies_if"] {
  if (!a || !known) return null;
  const key = resolveKey(known, normalizeFactKey(a.fact_key));
  const f = known.get(key);
  if (!f) return null;
  const when = validWhen(a.when, f);
  return when.length ? { fact_key: key, when } : null;
}

/** Cleans minted facts: normalized unique keys, sane options, and none that duplicate an existing key. */
export function normalizeNewFacts(raw: NewFact[], registry: Registry): Fact[] {
  const out = new Map<string, Fact>();
  for (const n of raw) {
    const key = normalizeFactKey(n.key);
    if (key.length < 3 || registry.has(key) || out.has(key)) continue;
    const options = [...new Set(n.options.map((o) => o.trim()).filter(Boolean))].slice(0, 6);
    const answer_type = n.answer_type === "choice" && options.length >= 2 ? "choice" : "bool";
    const question = n.question.trim();
    const you_phrase = n.you_phrase.trim().replace(/\.$/, "");
    if (!question || !you_phrase) continue;
    out.set(key, {
      key,
      question,
      you_phrase,
      answer_type,
      options: answer_type === "choice" ? options : [],
      topics: [...new Set(n.topics)].slice(0, 3),
      facets: [...new Set(n.facets)],
      canonical_key: null,
    });
  }
  return [...out.values()];
}

/** Splits model output into the stored analysis and the new facts that analysis actually references. */
export function normalizeOutput(o: AnalysisOutput, registry: Registry = new Map()): { analysis: Analysis; newFacts: Fact[] } {
  const { new_facts, ...a } = o;
  const minted = normalizeNewFacts(new_facts ?? [], registry);
  const known: Registry = new Map([...registry, ...minted.map((f) => [f.key, f] as const)]);
  const analysis = normalizeAnalysis(a, known);
  const used = new Set(analysis.impacts.flatMap((i) => (i.applies_if ? [i.applies_if.fact_key] : [])));
  return { analysis, newFacts: minted.filter((f) => used.has(f.key)) };
}

export function normalizeAnalysis(a: Analysis, known?: Registry): Analysis {
  return {
    ...a,
    headline: a.headline.trim().replace(/\.$/, ""),
    impacts: normalizeImpacts(a.impacts, known),
    topics: [...new Set(a.topics)].slice(0, 6),
    affected_groups: [...new Set(a.affected_groups)],
    keywords: [...new Set(a.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean))].slice(0, 10),
    significance: Math.min(5, Math.max(1, Math.round(a.significance))),
  };
}

export async function submitAnalysisBatch(items: AnalyzableItem[], model = FAST_MODEL, facts: Fact[] = []) {
  const batch = await anthropic().messages.batches.create({
    requests: items.map((item) => ({ custom_id: item.id, params: analysisParams(item, model, facts) })),
  });
  return batch.id;
}

export type BatchOutcome =
  | { status: "processing" }
  | {
      status: "ended";
      results: { itemId: string; analysis: Analysis | null; newFacts: Fact[]; model: string; usage?: Anthropic.Usage }[];
    };

/** `registry` is the fact registry at collection time, used to validate and canonicalize applies_if keys. */
export async function collectAnalysisBatch(batchId: string, registry: Registry = new Map()): Promise<BatchOutcome> {
  const client = anthropic();
  const batch = await client.messages.batches.retrieve(batchId);
  if (batch.processing_status !== "ended") return { status: "processing" };

  const results: Extract<BatchOutcome, { status: "ended" }>["results"] = [];
  for await (const r of await client.messages.batches.results(batchId)) {
    if (r.result.type !== "succeeded") {
      results.push({ itemId: r.custom_id, analysis: null, newFacts: [], model: "" });
      continue;
    }
    const msg = r.result.message;
    const text = msg.stop_reason === "end_turn" ? msg.content.find((b) => b.type === "text")?.text : undefined;
    const parsed = text ? AnalysisOutputSchema.safeParse(upgradeOutput(safeJson(text))) : null;
    const out = parsed?.success ? normalizeOutput(parsed.data, registry) : null;
    results.push({
      itemId: r.custom_id,
      analysis: out?.analysis ?? null,
      newFacts: out?.newFacts ?? [],
      model: msg.model,
      usage: msg.usage,
    });
  }
  return { status: "ended", results };
}

/** Batches submitted before analyze-v3 (still in flight across a deploy) lack new_facts and applies_if. */
function upgradeOutput(json: unknown): unknown {
  if (!json || typeof json !== "object") return json;
  const o = json as { impacts?: unknown; new_facts?: unknown };
  return {
    ...o,
    new_facts: o.new_facts ?? [],
    impacts: Array.isArray(o.impacts) ? o.impacts.map((i) => ({ applies_if: null, ...i })) : o.impacts,
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
