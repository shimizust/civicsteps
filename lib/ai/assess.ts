/**
 * "Ask about my situation": an on-demand, per-user look at how one item would affect this person,
 * beyond what the per-item rules can say. Rate-limited and cached by a hash of the answers it saw
 * (app/api/assess/route.ts). Privacy: it gets profile answers, fact answers and city/state only,
 * never the ZIP code, name or email.
 */
import { createHash } from "node:crypto";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { FACETS, FACET_SLUGS, DEMOGRAPHIC_QUESTIONS, type Demographics } from "@/lib/taxonomy";
import { factOptions, formatFactsForPrompt, normalizeFactKey, PROFILE_PREFIX, resolveKey, type Answers, type Fact, type QuestionOption, type Registry } from "@/lib/facts";
import type { ImpactInput } from "@/lib/impact";
import { anthropic, WRITER_MODEL } from "./client";
import { NewFactSchema, normalizeNewFacts } from "./analyze";

export const ASSESS_VERSION = "assess-v1";

export const Verdicts = ["benefit", "cost", "mixed", "neutral", "unclear"] as const;
export type Verdict = (typeof Verdicts)[number];

export const AssessSchema = z.object({
  overall: z
    .enum(Verdicts)
    .describe("Net practical effect on this person: 'neutral' if it barely touches them, 'unclear' if it depends on things you don't know"),
  summary: z.string().describe("1-2 sentences in second person ('You would likely…'), hedged, concrete"),
  points: z
    .array(
      z.object({
        facet: z.enum(FACET_SLUGS as [string, ...string[]]),
        direction: z.enum(["benefit", "cost", "mixed"]),
        text: z.string().describe("One sentence, second person, tied to something they told us or to the item text"),
      }),
    )
    .describe("1-4 specific effects, most important first"),
  follow_ups: z
    .array(NewFactSchema)
    .describe("0-3 questions whose answers would most change this assessment. Reuse an existing fact key when one fits. Never ask what they already answered or declined."),
});
export type AssessOutput = z.infer<typeof AssessSchema>;

/** What we store and render. */
export type Assessment = {
  overall: Verdict;
  summary: string;
  points: { facet: string; direction: "benefit" | "cost" | "mixed"; text: string }[];
  follow_ups: { key: string; question: string; helpText?: string; options: QuestionOption[] }[];
};

export type AssessInput = {
  item: {
    title: string;
    headline: string | null;
    type: string;
    level: string;
    agency: string | null;
    status: string | null;
    summary: string | null;
    why_it_matters: string | null;
    description: string | null;
  };
  place: string | null;
  impacts: ImpactInput[];
  demographics: Demographics;
  answers: Answers;
  registry: Registry;
  /** Registry facts on this item's topics, for reuse in follow-ups. */
  nearbyFacts: Fact[];
};

const SYSTEM = `You help one resident understand how a specific government item (bill, proposed rule, council agenda item) would practically affect them, for a nonpartisan civic app.

- Describe concrete, practical effects on this person: money, access, services, time, rules they'd follow. Not whether the policy is good, and never moral, religious or ideological judgments.
- Use only the item information and what the person told us. Don't invent figures. Hedge ("would likely", "could") where the text is uncertain.
- If you can't tell how it affects them, say so (overall "unclear") and ask the follow-up questions that would settle it.
- Follow-up questions are one-tap: prefer yes/no. Reuse an existing fact key whenever one asks the same thing. For specialized terms, add plain-language help_text and say where the resident can check their answer.
- Never ask about religion, immigration or citizenship status, health conditions, sexuality or gender identity, political views, or anything illegal, and never ask for names, addresses or contact details.`;

function describeProfile(d: Demographics): string[] {
  return DEMOGRAPHIC_QUESTIONS.flatMap((q) => {
    const v = d[q.key];
    if (v === undefined) return [];
    const answer = q.kind === "bool" ? (v ? "Yes" : "No") : (q.options.find(([o]) => o === v)?.[1] ?? String(v));
    return [`- ${q.ask} ${answer}`];
  });
}

function describeAnswers(answers: Answers, registry: Registry): { known: string[]; declined: string[] } {
  const known: string[] = [];
  const declined: string[] = [];
  for (const [key, value] of Object.entries(answers)) {
    if (key.startsWith(PROFILE_PREFIX)) {
      const q = DEMOGRAPHIC_QUESTIONS.find((x) => `${PROFILE_PREFIX}${x.key}` === key);
      if (q) declined.push(q.ask);
      continue;
    }
    const f = registry.get(key);
    if (!f) continue;
    if (value === null) declined.push(`${f.key}: ${f.question}`);
    else known.push(`- ${f.key}: ${f.question} ${factOptions(f).find((o) => o.value === value)?.label ?? value}`);
  }
  return { known, declined };
}

export function buildAssessPrompt(input: AssessInput): string {
  const { item } = input;
  const { known, declined } = describeAnswers(input.answers, input.registry);
  const impacts = input.impacts.map((i) => {
    const f = i.applies_if ? input.registry.get(resolveKey(input.registry, i.applies_if.fact_key)) : null;
    const who = [i.groups.length ? `groups: ${i.groups.join(", ")}` : "", f ? `if "${f.question}" is ${i.applies_if!.when.join("/")}` : ""].filter(Boolean).join("; ");
    return `- ${FACETS[i.facet as keyof typeof FACETS]?.label ?? i.facet}: ${i.direction}, magnitude ${i.magnitude}/3. ${i.note}${who ? ` (${who})` : ""}`;
  });
  const lines = [
    "ITEM",
    `Title: ${item.title}`,
    item.headline && `Headline: ${item.headline}`,
    `Type: ${item.type.replace("_", " ")}, ${item.level} level${item.agency ? `, ${item.agency}` : ""}`,
    item.status && `Status: ${item.status}`,
    item.summary && `Summary: ${item.summary}`,
    item.why_it_matters && `Why it matters: ${item.why_it_matters}`,
    item.description && `Description:\n${item.description.slice(0, 6000)}`,
    impacts.length ? `General impacts (estimated for everyone, before personalizing):\n${impacts.join("\n")}` : null,
    "",
    "THE PERSON",
    input.place && `Lives in: ${input.place}`,
    ...describeProfile(input.demographics),
    ...known,
    declined.length ? `Declined to answer (don't ask again): ${declined.join("; ")}` : null,
    "",
    `Existing fact keys you can reuse for follow-ups:\n${formatFactsForPrompt(input.nearbyFacts)}`,
  ];
  return lines.filter((l): l is string => typeof l === "string").join("\n");
}

/** Changes whenever anything the assessment depended on changes, so a stale cached answer isn't shown as current. */
export function assessmentHash(parts: { demographics: Demographics; answers: Answers; analysisVersion: string; place: string | null }): string {
  const sorted = (o: object) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return createHash("sha256")
    .update(JSON.stringify([ASSESS_VERSION, parts.analysisVersion, parts.place, sorted(parts.demographics), sorted(parts.answers)]))
    .digest("hex")
    .slice(0, 32);
}

/**
 * Follow-ups → questions to show. Reused keys resolve to the registry; new ones come back in `newFacts`
 * for the caller to insert. Anything already answered or declined is dropped.
 */
export function normalizeAssessment(o: AssessOutput, registry: Registry, answers: Answers): { assessment: Assessment; newFacts: Fact[] } {
  const follow: Assessment["follow_ups"] = [];
  const minted: AssessOutput["follow_ups"] = [];
  for (const f of o.follow_ups.slice(0, 3)) {
    const key = resolveKey(registry, normalizeFactKey(f.key));
    const existing = registry.get(key);
    if (key in answers) continue;
    if (existing) follow.push({ key, question: existing.question, helpText: existing.help_text ?? f.help_text?.trim(), options: factOptions(existing) });
    else minted.push(f);
  }
  const newFacts = normalizeNewFacts(minted, registry).filter((f) => !(f.key in answers));
  for (const f of newFacts) follow.push({ key: f.key, question: f.question, helpText: f.help_text ?? undefined, options: factOptions(f) });

  return {
    assessment: {
      overall: o.overall,
      summary: o.summary.trim(),
      points: o.points.slice(0, 4).map((p) => ({ ...p, text: p.text.trim() })),
      follow_ups: follow,
    },
    newFacts,
  };
}

export async function runAssessment(input: AssessInput): Promise<{ output: AssessOutput; model: string } | { refused: true }> {
  const res = await anthropic().messages.parse({
    model: WRITER_MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: zodOutputFormat(AssessSchema) },
    messages: [{ role: "user", content: buildAssessPrompt(input) }],
  });
  if (res.stop_reason !== "end_turn" || !res.parsed_output) return { refused: true };
  return { output: res.parsed_output, model: res.model };
}
