import { describe, expect, it } from "vitest";
import { hasDirection, personalImpact, unaffectedFacets, type ImpactInput } from "@/lib/impact";
import { normalizeImpacts, type Impact } from "@/lib/ai/analyze";
import { heuristicAnalysis } from "@/lib/ai/heuristic";
import { facetsForTopic } from "@/lib/taxonomy";

const imp = (over: Partial<ImpactInput>): ImpactInput => ({ facet: "home", magnitude: 2, direction: "cost", groups: [], note: "", ...over });
const pet = { label: "Climbing access", topic_slugs: ["public-lands/climbing-access"], is_pet: true };

describe("personalImpact", () => {
  it("raises a facet that names a group the user is in, and says why", () => {
    const p = personalImpact([imp({ groups: ["renters"], note: "Caps rent increases at 5%" })], { groups: ["renters"], matched: [] });
    expect(p.facets[0]).toMatchObject({ facet: "home", magnitude: 3, forOthers: false, because: ["you rent"] });
    expect(p.level).toBe("high");
  });

  it("dims facets aimed at groups the user isn't in", () => {
    const p = personalImpact([imp({ facet: "work", groups: ["farmers"] })], { groups: ["renters", "urban-residents"], matched: [] });
    expect(p.facets[0]).toMatchObject({ magnitude: 1, forOthers: true, who: ["farmers & ranchers"] });
  });

  it("uses profile groups for broad impacts", () => {
    const p = personalImpact([imp({ facet: "mobility", magnitude: 1, direction: "benefit" })], { groups: ["transit-riders"], matched: [] });
    expect(p.facets[0]).toMatchObject({ magnitude: 2, because: ["you ride transit"] });
  });

  it("credits a matched pet issue without inflating magnitude, and surfaces it as at least medium", () => {
    const p = personalImpact([imp({ facet: "environment", magnitude: 1, direction: "mixed" })], { groups: [], matched: [pet] });
    expect(p.facets[0]).toMatchObject({ magnitude: 1, because: ["your pet issue: Climbing access"] });
    expect(p.level).toBe("medium");
  });

  it("does not raise magnitude just because the user follows the topic", () => {
    const follow = { label: "Housing", topic_slugs: ["housing"], is_pet: false };
    const p = personalImpact([imp({ magnitude: 1 })], { groups: [], matched: [follow] });
    expect(p.facets[0]).toMatchObject({ magnitude: 1, because: ["you follow Housing"] });
  });

  it("credits a keyword-only pet match on the main facet", () => {
    const kwPet = { ...pet, topic_slugs: [] };
    const p = personalImpact([imp({ facet: "wallet", magnitude: 1 }), imp({ facet: "safety", magnitude: 2 })], { groups: [], matched: [kwPet] });
    expect(p.facets.find((f) => f.facet === "safety")!.because).toEqual(["your pet issue: Climbing access"]);
  });

  it("sorts by personal magnitude and drops unknown facets", () => {
    const p = personalImpact(
      [imp({ facet: "wallet", magnitude: 1 }), imp({ facet: "health", magnitude: 3 }), imp({ facet: "nonsense" })],
      { groups: [], matched: [] },
    );
    expect(p.facets.map((f) => f.facet)).toEqual(["health", "wallet"]);
    expect(unaffectedFacets(p)).not.toContain("health");
  });

  it("returns no level when there is nothing to show (pre-v2 analysis)", () => {
    expect(personalImpact(undefined, { groups: ["renters"], matched: [] }).level).toBeNull();
  });

  it("heuristic impacts are all mixed, so no arrows are shown", () => {
    const a = heuristicAnalysis({ title: "Raising rent caps for tenants and expanding bus service", description: null, agency: null });
    expect(a.impacts.length).toBeGreaterThan(0);
    expect(hasDirection(personalImpact(a.impacts, { groups: ["renters"], matched: [] }))).toBe(false);
  });
});

describe("normalizeImpacts", () => {
  it("dedupes facets, clamps magnitude, caps count and keeps rights neutral", () => {
    const raw: Impact[] = [
      { facet: "wallet", magnitude: 7, direction: "cost", groups: ["renters", "renters", "aliens" as never], note: " Adds a fee ", applies_if: null },
      { facet: "wallet", magnitude: 1, direction: "benefit", groups: [], note: "dupe", applies_if: null },
      { facet: "rights", magnitude: 2, direction: "benefit", groups: [], note: "x", applies_if: null },
      { facet: "health", magnitude: 0, direction: "mixed", groups: [], note: "", applies_if: null },
      { facet: "home", magnitude: 1, direction: "mixed", groups: [], note: "", applies_if: null },
      { facet: "work", magnitude: 1, direction: "mixed", groups: [], note: "", applies_if: null },
    ];
    const out = normalizeImpacts(raw);
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({ facet: "wallet", magnitude: 3, direction: "cost", groups: ["renters"], note: "Adds a fee", applies_if: null });
    expect(out[1].direction).toBe("mixed");
    expect(out[2].magnitude).toBe(1);
  });
});

describe("facetsForTopic", () => {
  it("prefers a child mapping and falls back to the parent", () => {
    expect(facetsForTopic("economy/taxes")).toEqual(["wallet"]);
    expect(facetsForTopic("public-lands/climbing-access")).toEqual(["environment"]);
  });
});
