/**
 * Per-item analysis: plain-language summary, topic tags, affected groups, significance and
 * neutral arguments. Runs once per item (not per user) through the Message Batches API at 50% off.
 * Topics and groups are constrained to the taxonomy via structured outputs, so matching
 * to users is plain SQL afterwards.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AFFECTED_GROUP_SLUGS, FACETS, FACET_SLUGS, TOPICS } from "@/lib/taxonomy";
import { anthropic, FAST_MODEL } from "./client";

export const PROMPT_VERSION = "analyze-v2";

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
});
export type Impact = z.infer<typeof ImpactSchema>;

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

export function analysisParams(item: AnalyzableItem, model = FAST_MODEL): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 4000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: model === FAST_MODEL ? "low" : "medium", format: zodOutputFormat(AnalysisSchema) },
    messages: [{ role: "user", content: itemPrompt(item) }],
  };
}

export function normalizeImpacts(impacts: Impact[]): Impact[] {
  const seen = new Set<string>();
  return impacts
    .filter((i) => FACET_SLUGS.includes(i.facet as never) && !seen.has(i.facet) && seen.add(i.facet))
    .map((i) => ({
      ...i,
      magnitude: Math.min(3, Math.max(1, Math.round(i.magnitude))),
      direction: i.facet === "rights" ? "mixed" : i.direction,
      groups: [...new Set(i.groups)].filter((g) => AFFECTED_GROUP_SLUGS.includes(g as never)),
      note: i.note.trim(),
    }))
    .slice(0, 4);
}

export function normalizeAnalysis(a: Analysis): Analysis {
  return {
    ...a,
    headline: a.headline.trim().replace(/\.$/, ""),
    impacts: normalizeImpacts(a.impacts),
    topics: [...new Set(a.topics)].slice(0, 6),
    affected_groups: [...new Set(a.affected_groups)],
    keywords: [...new Set(a.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean))].slice(0, 10),
    significance: Math.min(5, Math.max(1, Math.round(a.significance))),
  };
}

export async function submitAnalysisBatch(items: AnalyzableItem[], model = FAST_MODEL) {
  const batch = await anthropic().messages.batches.create({
    requests: items.map((item) => ({ custom_id: item.id, params: analysisParams(item, model) })),
  });
  return batch.id;
}

export type BatchOutcome =
  | { status: "processing" }
  | {
      status: "ended";
      results: { itemId: string; analysis: Analysis | null; model: string; usage?: Anthropic.Usage }[];
    };

export async function collectAnalysisBatch(batchId: string): Promise<BatchOutcome> {
  const client = anthropic();
  const batch = await client.messages.batches.retrieve(batchId);
  if (batch.processing_status !== "ended") return { status: "processing" };

  const results: Extract<BatchOutcome, { status: "ended" }>["results"] = [];
  for await (const r of await client.messages.batches.results(batchId)) {
    if (r.result.type !== "succeeded") {
      results.push({ itemId: r.custom_id, analysis: null, model: "" });
      continue;
    }
    const msg = r.result.message;
    const text = msg.stop_reason === "end_turn" ? msg.content.find((b) => b.type === "text")?.text : undefined;
    const parsed = text ? AnalysisSchema.safeParse(safeJson(text)) : null;
    results.push({
      itemId: r.custom_id,
      analysis: parsed?.success ? normalizeAnalysis(parsed.data) : null,
      model: msg.model,
      usage: msg.usage,
    });
  }
  return { status: "ended", results };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
