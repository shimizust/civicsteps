/**
 * Facts: specific things about a user that decide whether an item's impact reaches them
 * ("Do you ride BART?"). The AI mints them once per item and reuses existing ones (lib/ai/analyze.ts).
 * We ask a user only when an item in front of them depends on one, then remember the answer.
 * Pure helpers, no I/O, safe to import from client components.
 */
import { DEMOGRAPHIC_QUESTIONS, expandTopics, type Demographics } from "@/lib/taxonomy";

export type FactAnswerType = "bool" | "choice";

export type Fact = {
  key: string;
  question: string;
  you_phrase: string;
  answer_type: FactAnswerType;
  options: string[];
  topics: string[];
  facets: string[];
  canonical_key: string | null;
};

export type Registry = Map<string, Fact>;

/** On an impact: it reaches the user only if their answer to `fact_key` is one of `when`. */
export type AppliesIf = { fact_key: string; when: string[] };

/** A user's answers by fact key. null = "prefer not to say" (don't ask again). */
export type Answers = Record<string, string | null>;

/** Prefix for remembering a declined onboarding question in user_facts. */
export const PROFILE_PREFIX = "profile:";

export type QuestionOption = { value: string; label: string };

/** Something we could ask to personalize an item. */
export type OpenQuestion = {
  kind: "fact" | "profile";
  key: string;
  question: string;
  options: QuestionOption[];
  /** Largest item-level magnitude among the impacts that depend on it (1-3). */
  magnitude: number;
};

const YES_NO: QuestionOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

/** "Do you ride BART?" → "rides_bart"-style keys: lowercase, underscores, max 60 chars. */
export function normalizeFactKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
    .replace(/_+$/, "");
}

/** Follow merges (`canonical_key`) to the surviving fact. */
export function resolveKey(registry: Registry, key: string): string {
  let k = key;
  for (let i = 0; i < 5; i++) {
    const next = registry.get(k)?.canonical_key;
    if (!next) break;
    k = next;
  }
  return k;
}

export function factOptions(f: Pick<Fact, "answer_type" | "options">): QuestionOption[] {
  return f.answer_type === "bool" ? YES_NO : f.options.map((o) => ({ value: o.toLowerCase(), label: o }));
}

/** Canonical stored form of an answer, or undefined if it isn't a valid answer to this fact. */
export function normalizeAnswer(f: Pick<Fact, "answer_type" | "options">, raw: string | null): string | null | undefined {
  if (raw === null) return null;
  const v = raw.toLowerCase().trim();
  return factOptions(f).some((o) => o.value === v) ? v : undefined;
}

export function factQuestion(f: Fact, magnitude = 1): OpenQuestion {
  return { kind: "fact", key: f.key, question: f.question, options: factOptions(f), magnitude };
}

export function profileQuestion(key: keyof Demographics, magnitude = 1): OpenQuestion | null {
  const q = DEMOGRAPHIC_QUESTIONS.find((x) => x.key === key);
  if (!q) return null;
  const options = q.kind === "bool" ? YES_NO : q.options.map(([value, label]) => ({ value, label }));
  return { kind: "profile", key, question: q.ask, options, magnitude };
}

/** The display label for a stored answer. */
export function answerLabel(f: Pick<Fact, "answer_type" | "options">, value: string | null): string {
  if (value === null) return "Prefer not to say";
  return factOptions(f).find((o) => o.value === value)?.label ?? value;
}

/**
 * Existing facts worth showing the AI for one item, so it reuses keys instead of minting near-duplicates.
 * Facts sharing a topic (or parent topic) with the item come first; the rest fill up to `cap`.
 */
export function factsForPrompt(facts: Fact[], itemTopics: string[], cap = 80): Fact[] {
  const want = new Set(expandTopics(itemTopics));
  const canonical = facts.filter((f) => !f.canonical_key);
  const overlap = (f: Fact) => expandTopics(f.topics).filter((t) => want.has(t)).length;
  const scored = canonical.map((f) => ({ f, s: overlap(f) })).filter((x) => x.s > 0);
  scored.sort((a, b) => b.s - a.s || a.f.key.localeCompare(b.f.key));
  return scored.slice(0, cap).map((x) => x.f);
}

export function formatFactsForPrompt(facts: Fact[]): string {
  if (!facts.length) return "(none yet for this topic)";
  return facts
    .map((f) => `- ${f.key} [${f.answer_type === "bool" ? "yes/no" : f.options.join(" | ")}]: ${f.question}`)
    .join("\n");
}
