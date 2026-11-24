/**
 * "How this affects you": turns an item's per-facet impacts (scored once by the AI, or by the
 * keyword fallback) into a personal scorecard using only the user's profile. No LLM, no I/O.
 */
import {
  AFFECTED_GROUPS,
  FACETS,
  FACET_GROUPS,
  FACET_SLUGS,
  facetsForTopic,
  GROUP_DEMOGRAPHIC,
  type AffectedGroup,
  type Demographics,
  type Facet,
} from "@/lib/taxonomy";
import { factQuestion, PROFILE_PREFIX, profileQuestion, resolveKey, type AppliesIf, type Answers, type OpenQuestion, type Registry } from "@/lib/facts";

export type Direction = "benefit" | "cost" | "mixed";
export type ImpactInput = {
  facet: string;
  magnitude: number;
  direction: Direction;
  groups: string[];
  note: string;
  /** analyze-v3: the impact reaches only people with this answer to a specific fact. */
  applies_if?: AppliesIf | null;
};

/** An interest that matched this item (see `matchInterests` in lib/relevance.ts). */
export type MatchedInterest = { label: string; topic_slugs: string[]; is_pet: boolean };

export type PersonalFacet = {
  facet: Facet;
  label: string;
  /** 0-3 after personalization. */
  magnitude: number;
  /** 1-3 as scored for the item, before personalization. */
  base: number;
  direction: Direction;
  note: string;
  because: string[];
  /** The item names specific groups and the user isn't in any of them. */
  forOthers: boolean;
  /** Who the item says feels it, e.g. "farmers & ranchers". */
  who: string[];
  /** The user's answer to a specific fact (applies_if) confirmed this reaches them. */
  viaFact: boolean;
};

export type ImpactLevel = "low" | "medium" | "high";
export type PersonalImpact = {
  overall: number;
  level: ImpactLevel | null;
  facets: PersonalFacet[];
  /** Questions whose answers would sharpen this estimate, most consequential first. */
  open: OpenQuestion[];
};

/**
 * What we know about the user. `demographics` is optional: without it (older callers, tests) named groups the
 * user isn't in always count as "for others"; with it, an unanswered question makes the group unknown instead.
 */
export type ImpactContext = {
  groups: AffectedGroup[];
  matched: MatchedInterest[];
  demographics?: Demographics;
  answers?: Answers;
  registry?: Registry;
};

/** Second-person phrasing for "because …". */
const YOU: Record<AffectedGroup, string> = {
  renters: "you rent",
  homeowners: "you own your home",
  "low-income": "your household income",
  "middle-income": "your household income",
  "high-income": "your household income",
  students: "you're a student",
  parents: "you're a parent",
  seniors: "you're 65+",
  veterans: "you're a veteran",
  "small-business-owners": "you run a small business",
  "hourly-workers": "you work hourly",
  "union-members": "you're in a union",
  "healthcare-workers": "you work in health care",
  teachers: "you teach",
  "tech-workers": "you work in tech",
  farmers: "you farm or ranch",
  "rural-residents": "you live in a rural area",
  "urban-residents": "you live in a city",
  "people-with-disabilities": "you have a disability",
  immigrants: "you're an immigrant",
  "outdoor-recreationists": "you spend time outdoors",
  "transit-riders": "you ride transit",
  drivers: "you drive",
  "medicare-beneficiaries": "you're on Medicare",
  "medicaid-beneficiaries": "you're on Medicaid",
  uninsured: "you're uninsured",
};

const isFacet = (f: string): f is Facet => (FACET_SLUGS as string[]).includes(f);

export function personalImpact(impacts: ImpactInput[] | null | undefined, ctx: ImpactContext): PersonalImpact {
  const mine = new Set<string>(ctx.groups);
  const valid = (impacts ?? []).filter((i) => isFacet(i.facet));
  const petMatched = ctx.matched.some((m) => m.is_pet);
  const answers = ctx.answers ?? {};
  const open = new Map<string, OpenQuestion>();
  const ask = (q: OpenQuestion | null, magnitude: number) => {
    if (!q) return;
    const prev = open.get(`${q.kind}:${q.key}`);
    open.set(`${q.kind}:${q.key}`, { ...q, magnitude: Math.max(prev?.magnitude ?? 0, magnitude) });
  };

  const facets: PersonalFacet[] = valid.map((i) => {
    const facet = i.facet as Facet;
    const because: string[] = [];
    let mag = i.magnitude;

    // A specific fact, when the user has answered it, settles whether this reaches them.
    const fact = factFor(i.applies_if, ctx.registry);
    const answer = fact ? answers[fact.key] : undefined;
    const factSays: boolean | null = fact && typeof answer === "string" ? i.applies_if!.when.includes(answer) : null;
    if (fact && answer === undefined) ask(factQuestion(fact), i.magnitude);

    const named = i.groups.filter((g): g is AffectedGroup => g in AFFECTED_GROUPS);
    const hit = named.filter((g) => mine.has(g));
    // Groups the user might still be in because they skipped the question that decides it.
    const unknownGroups = ctx.demographics ? named.filter((g) => !mine.has(g) && groupUnknown(g, ctx.demographics!, answers)) : [];

    let forOthers: boolean;
    let viaFact = false;
    if (factSays === true) {
      mag += 1;
      because.push(fact!.you_phrase);
      forOthers = false;
      viaFact = true;
    } else if (factSays === false) {
      mag -= 1;
      forOthers = true;
    } else {
      forOthers = named.length > 0 && hit.length === 0 && unknownGroups.length === 0;
      const profileHit = hit.length ? hit : named.length ? [] : FACET_GROUPS[facet].filter((g) => mine.has(g));
      if (profileHit.length) {
        mag += 1;
        because.push(...new Set(profileHit.map((g) => YOU[g])));
      }
      if (forOthers) mag -= 1;
      if (!hit.length && !fact) {
        for (const g of unknownGroups) ask(profileQuestion(GROUP_DEMOGRAPHIC[g]!), i.magnitude);
      }
    }

    // Interests explain why you'd care, but following a topic doesn't make an item affect you more.
    const interestHits = ctx.matched.filter((m) => m.topic_slugs.some((t) => facetsForTopic(t).includes(facet)));
    if (interestHits.length) {
      because.push(...interestHits.map((m) => (m.is_pet ? `your pet issue: ${m.label}` : `you follow ${m.label}`)));
    }

    return {
      facet,
      label: FACETS[facet].label,
      magnitude: Math.max(0, Math.min(3, mag)),
      base: i.magnitude,
      direction: i.direction,
      note: i.note,
      because: [...new Set(because)],
      forOthers,
      who: named.map((g) => AFFECTED_GROUPS[g].toLowerCase()),
      viaFact,
    };
  });

  // A pet issue matched on keywords alone (no topic overlap) is credited on the item's main facet.
  if (petMatched && facets.length && !facets.some((f) => f.because.some((b) => b.startsWith("your pet issue")))) {
    const pet = ctx.matched.find((m) => m.is_pet)!;
    facets.reduce((a, b) => (b.base > a.base ? b : a)).because.push(`your pet issue: ${pet.label}`);
  }

  facets.sort((a, b) => b.magnitude - a.magnitude || Number(a.forOthers) - Number(b.forOthers) || b.base - a.base);

  const [m1 = 0, m2 = 0, m3 = 0] = facets.map((f) => f.magnitude);
  // The biggest effect dominates; extra facets add a little. Max 99.
  let overall = m1 * 22 + m2 * 7 + m3 * 4;
  // Pet issues always surface as at least "medium"; the star on the card says why.
  if (petMatched) overall = Math.max(overall, 30);
  const level: ImpactLevel | null = !facets.length && !petMatched ? null : overall >= 62 ? "high" : overall >= 25 ? "medium" : "low";

  return { overall, level, facets, open: [...open.values()].sort((a, b) => b.magnitude - a.magnitude) };
}

function factFor(cond: AppliesIf | null | undefined, registry: Registry | undefined) {
  if (!cond || !registry) return null;
  return registry.get(resolveKey(registry, cond.fact_key)) ?? null;
}

/** The user skipped (and didn't decline) the onboarding question that decides group membership. */
function groupUnknown(g: AffectedGroup, d: Demographics, answers: Answers): boolean {
  const key = GROUP_DEMOGRAPHIC[g];
  return !!key && d[key] === undefined && !(`${PROFILE_PREFIX}${key}` in answers);
}

export type RankedQuestion = OpenQuestion & { itemCount: number; weight: number };

/**
 * The few questions that would personalize the most of what's in front of the user: each open question is
 * weighted by the score of every item that depends on it times how big that item's effect is.
 */
export function rankOpenQuestions(items: { score: number; impact: PersonalImpact }[], n = 3): RankedQuestion[] {
  const agg = new Map<string, RankedQuestion>();
  for (const it of items) {
    for (const q of it.impact.open) {
      const id = `${q.kind}:${q.key}`;
      const prev = agg.get(id) ?? { ...q, itemCount: 0, weight: 0 };
      prev.itemCount += 1;
      prev.weight += Math.max(1, it.score) * q.magnitude;
      prev.magnitude = Math.max(prev.magnitude, q.magnitude);
      agg.set(id, prev);
    }
  }
  return [...agg.values()].sort((a, b) => b.weight - a.weight || b.itemCount - a.itemCount).slice(0, n);
}

/** Facets with no listed impact, for the "not significantly affected" line. */
export function unaffectedFacets(p: PersonalImpact): Facet[] {
  const hit = new Set(p.facets.map((f) => f.facet));
  return FACET_SLUGS.filter((f) => !hit.has(f));
}

/** Only show arrows when at least one direction is concrete (AI analysis, not the keyword fallback). */
export const hasDirection = (p: PersonalImpact) => p.facets.some((f) => f.direction !== "mixed");
