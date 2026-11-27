import { describe, expect, it } from "vitest";
import { personalImpact, rankOpenQuestions, type ImpactInput } from "@/lib/impact";
import { factQuestion, factsForPrompt, normalizeAnswer, normalizeFactKey, resolveKey, type Fact, type Registry } from "@/lib/facts";
import { normalizeOutput, type AnalysisOutput } from "@/lib/ai/analyze";
import { normalizeAssessment, assessmentHash, type AssessOutput } from "@/lib/ai/assess";
import { validMerges } from "@/ingest/consolidateFacts";
import { cleanDemographics } from "@/lib/taxonomy";

const fact = (over: Partial<Fact> & { key: string }): Fact => ({
  question: `Q ${over.key}?`,
  you_phrase: `you ${over.key}`,
  answer_type: "bool",
  options: [],
  topics: ["transportation/transit"],
  facets: ["mobility"],
  canonical_key: null,
  ...over,
});

const bart = fact({ key: "rides_bart", question: "Do you ride BART?", you_phrase: "you ride BART" });
const registry: Registry = new Map([
  [bart.key, bart],
  ["uses_bart", fact({ key: "uses_bart", canonical_key: "rides_bart" })],
]);

const fare: ImpactInput = {
  facet: "mobility",
  magnitude: 2,
  direction: "cost",
  groups: ["transit-riders"],
  note: "Raises BART fares 10%",
  applies_if: { fact_key: "uses_bart", when: ["yes"] },
};

describe("facts helpers", () => {
  it("normalizes keys", () => {
    expect(normalizeFactKey(" Rides BART? ")).toBe("rides_bart");
    expect(normalizeFactKey("Climbs @ Indian Creek!!")).toBe("climbs_indian_creek");
  });

  it("follows merges to the surviving fact", () => {
    expect(resolveKey(registry, "uses_bart")).toBe("rides_bart");
    expect(resolveKey(registry, "unknown")).toBe("unknown");
  });

  it("validates answers", () => {
    expect(normalizeAnswer(bart, "Yes")).toBe("yes");
    expect(normalizeAnswer(bart, "maybe")).toBeUndefined();
    expect(normalizeAnswer(bart, null)).toBeNull();
    expect(normalizeAnswer(fact({ key: "car", answer_type: "choice", options: ["Gas", "Electric", "None"] }), "Electric")).toBe("electric");
  });

  it("offers the AI only canonical facts on the item's topics, closest first", () => {
    const facts = [
      bart,
      fact({ key: "uses_bart", canonical_key: "rides_bart" }),
      fact({ key: "climbs_indian_creek", topics: ["public-lands/climbing-access"] }),
      fact({ key: "rides_any_transit", topics: ["transportation"] }),
    ];
    expect(factsForPrompt(facts, ["transportation/transit"]).map((f) => f.key)).toEqual(["rides_bart", "rides_any_transit"]);
    expect(factsForPrompt(facts, ["public-lands/national-parks"]).map((f) => f.key)).toEqual(["climbs_indian_creek"]);
  });
});

describe("personalImpact with facts", () => {
  const base = { groups: [], matched: [], demographics: {}, registry };

  it("a yes answer confirms the impact and says why", () => {
    const p = personalImpact([fare], { ...base, answers: { rides_bart: "yes" } });
    expect(p.facets[0]).toMatchObject({ magnitude: 3, forOthers: false, viaFact: true, because: ["you ride BART"] });
    expect(p.open).toEqual([]);
  });

  it("a no answer dims it, even for transit riders", () => {
    const p = personalImpact([fare], { ...base, groups: ["transit-riders"], answers: { rides_bart: "no" } });
    expect(p.facets[0]).toMatchObject({ magnitude: 1, forOthers: true, viaFact: false });
  });

  it("an unknown fact asks the fact question (not the broader profile one)", () => {
    const p = personalImpact([fare], { ...base, answers: {} });
    expect(p.facets[0]).toMatchObject({ magnitude: 2, forOthers: false });
    expect(p.open).toEqual([expect.objectContaining({ kind: "fact", key: "rides_bart", question: "Do you ride BART?", magnitude: 2 })]);
  });

  it("a declined fact is not asked again and falls back to groups", () => {
    const p = personalImpact([fare], { ...base, groups: ["transit-riders"], answers: { rides_bart: null } });
    expect(p.open).toEqual([]);
    expect(p.facets[0]).toMatchObject({ magnitude: 3, because: ["you ride transit"] });
  });

  it("asks a skipped onboarding question when a named group depends on it", () => {
    const rent: ImpactInput = { facet: "home", magnitude: 3, direction: "benefit", groups: ["renters"], note: "Caps rent", applies_if: null };
    const p = personalImpact([rent], { ...base, answers: {} });
    expect(p.facets[0].forOthers).toBe(false); // unknown, not "for others"
    expect(p.open).toEqual([expect.objectContaining({ kind: "profile", key: "housing", magnitude: 3 })]);

    const declined = personalImpact([rent], { ...base, answers: { "profile:housing": null } });
    expect(declined.open).toEqual([]);
    expect(declined.facets[0].forOthers).toBe(true);
  });

  it("never prompts for immigration status or disability", () => {
    const i: ImpactInput = { facet: "rights", magnitude: 3, direction: "mixed", groups: ["immigrants", "people-with-disabilities"], note: "", applies_if: null };
    expect(personalImpact([i], { ...base, answers: {} }).open).toEqual([]);
  });

  it("behaves as before without a registry", () => {
    const p = personalImpact([fare], { groups: ["transit-riders"], matched: [] });
    expect(p.facets[0]).toMatchObject({ magnitude: 3, because: ["you ride transit"], viaFact: false });
    expect(p.open).toEqual([]);
  });
});

describe("rankOpenQuestions", () => {
  it("prefers the question behind more, higher-scoring, bigger items", () => {
    const q = (key: string, magnitude: number) => ({ kind: "fact" as const, key, question: key, options: [], magnitude });
    const imp = (...open: ReturnType<typeof q>[]) => ({ overall: 0, level: null, facets: [], open });
    const ranked = rankOpenQuestions([
      { score: 20, impact: imp(q("rides_bart", 2)) },
      { score: 15, impact: imp(q("rides_bart", 1), q("owns_ev", 3)) },
      { score: 1, impact: imp(q("climbs_indian_creek", 3), q("rides_muni", 1)) },
    ]);
    expect(ranked.map((r) => r.key)).toEqual(["rides_bart", "owns_ev", "climbs_indian_creek", "rides_muni"]);
    expect(ranked[0]).toMatchObject({ itemCount: 2, magnitude: 2 });
  });
});

describe("normalizeOutput", () => {
  const out = (impacts: AnalysisOutput["impacts"], new_facts: AnalysisOutput["new_facts"]): AnalysisOutput => ({
    headline: "Raises fares.",
    summary: "",
    why_it_matters: "",
    topics: ["transportation/transit"],
    affected_groups: [],
    impacts,
    keywords: [],
    significance: 3,
    arguments_for: [],
    arguments_against: [],
    new_facts,
  });
  const imp = (applies_if: AnalysisOutput["impacts"][number]["applies_if"]) => ({ facet: "mobility", magnitude: 2, direction: "cost" as const, groups: [], note: "", applies_if });

  it("canonicalizes reused keys and keeps only valid answers", () => {
    const { analysis, newFacts } = normalizeOutput(out([imp({ fact_key: "Uses BART", when: ["YES", "sometimes"] })], []), registry);
    expect(analysis.impacts[0].applies_if).toEqual({ fact_key: "rides_bart", when: ["yes"] });
    expect(newFacts).toEqual([]);
  });

  it("keeps new facts that are referenced, drops unreferenced ones and unknown keys", () => {
    const { analysis, newFacts } = normalizeOutput(
      out(
        [imp({ fact_key: "rides_muni", when: ["yes"] }), { ...imp({ fact_key: "made_up", when: ["yes"] }), facet: "wallet" }],
        [
          { key: "rides_muni", question: "Do you ride Muni?", help_text: "  Muni runs buses and trains in San Francisco.  ", you_phrase: "you ride Muni.", answer_type: "bool", options: [], topics: ["transportation/transit"], facets: ["mobility"] },
          { key: "unused_fact", question: "Unused?", you_phrase: "x", answer_type: "bool", options: [], topics: [], facets: [] },
          { key: "rides_bart", question: "Dup of existing", you_phrase: "x", answer_type: "bool", options: [], topics: [], facets: [] },
        ],
      ),
      registry,
    );
    expect(analysis.impacts.map((i) => i.applies_if)).toEqual([{ fact_key: "rides_muni", when: ["yes"] }, null]);
    expect(newFacts.map((f) => f.key)).toEqual(["rides_muni"]);
    expect(newFacts[0].you_phrase).toBe("you ride Muni");
    expect(factQuestion(newFacts[0]).helpText).toBe("Muni runs buses and trains in San Francisco.");
    expect(analysis).not.toHaveProperty("new_facts");
    expect(analysis.headline).toBe("Raises fares");
  });

  it("turns a choice fact with too few options into yes/no", () => {
    const { newFacts } = normalizeOutput(
      out([imp({ fact_key: "owns_ev", when: ["yes"] })], [
        { key: "owns_ev", question: "Do you own an EV?", you_phrase: "you own an EV", answer_type: "choice", options: ["Yes"], topics: [], facets: [] },
      ]),
      registry,
    );
    expect(newFacts[0]).toMatchObject({ answer_type: "bool", options: [] });
  });
});

describe("validMerges", () => {
  const byKey = new Map<string, Fact>([
    ["rides_bart", bart],
    ["takes_bart", fact({ key: "takes_bart" })],
    ["car_type", fact({ key: "car_type", answer_type: "choice", options: ["Gas", "Electric"] })],
    ["vehicle", fact({ key: "vehicle", answer_type: "choice", options: ["Gas", "Electric", "None"] })],
  ]);
  it("accepts compatible merges of new facts only", () => {
    const m = validMerges(
      [
        { duplicate: "takes_bart", canonical: "rides_bart" },
        { duplicate: "rides_bart", canonical: "takes_bart" }, // not new
        { duplicate: "car_type", canonical: "vehicle" },
        { duplicate: "vehicle", canonical: "rides_bart" }, // type mismatch
      ],
      new Set(["takes_bart", "car_type", "vehicle"]),
      byKey,
    );
    expect([...m]).toEqual([
      ["takes_bart", "rides_bart"],
      ["car_type", "vehicle"],
    ]);
  });
});

describe("assessment", () => {
  it("reuses registry follow-ups, mints new ones, and skips answered ones", () => {
    const o: AssessOutput = {
      overall: "unclear",
      summary: " Depends on how you commute. ",
      points: [],
      follow_ups: [
        { key: "uses_bart", question: "Do you use BART?", you_phrase: "", answer_type: "bool", options: [], topics: [], facets: [] },
        { key: "parks_at_bart", question: "Do you park at a BART station?", you_phrase: "you park at BART", answer_type: "bool", options: [], topics: ["transportation/transit"], facets: ["mobility"] },
        { key: "owns_ev", question: "Own an EV?", you_phrase: "you own an EV", answer_type: "bool", options: [], topics: [], facets: [] },
      ],
    };
    const { assessment, newFacts } = normalizeAssessment(o, registry, { owns_ev: "no" });
    expect(assessment.summary).toBe("Depends on how you commute.");
    expect(assessment.follow_ups.map((f) => f.key)).toEqual(["rides_bart", "parks_at_bart"]);
    expect(assessment.follow_ups[0].question).toBe("Do you ride BART?");
    expect(newFacts.map((f) => f.key)).toEqual(["parks_at_bart"]);
  });

  it("keys assessments by answers and place regardless of answer order", () => {
    const h = (answers: Record<string, string | null>, place = "Denver, CO") =>
      assessmentHash({ demographics: { housing: "rent" }, answers, analysisVersion: "v3", place });
    expect(h({}, "Denver, CO")).not.toBe(h({}, "Seattle, WA"));
    expect(h({ a: "yes", b: "no" })).toBe(h({ b: "no", a: "yes" }));
    expect(h({ a: "yes" })).not.toBe(h({ a: "no" }));
  });
});

describe("cleanDemographics", () => {
  it("keeps known keys and valid values, accepting yes/no for bools", () => {
    expect(cleanDemographics({ housing: "rent", income: "lots", student: "yes", veteran: false, bogus: 1 })).toEqual({ housing: "rent", student: true, veteran: false });
  });
});
