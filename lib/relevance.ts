/**
 * Ranks feed candidates for one user. No LLM: everything comes from per-item analysis
 * tags computed once and the user's profile. `feed_candidates()` in SQL does the coarse prefilter.
 */
import { AFFECTED_GROUPS, expandTopics, topicName, type AffectedGroup, type Demographics } from "@/lib/taxonomy";
import { personalImpact, rankOpenQuestions, type ImpactInput, type PersonalImpact, type RankedQuestion } from "@/lib/impact";
import type { Answers, Registry } from "@/lib/facts";

export type FeedItem = {
  id: string;
  type: string;
  level: "city" | "county" | "state" | "federal";
  jurisdiction_id: string | null;
  title: string;
  url: string | null;
  agency: string | null;
  status: string | null;
  last_action: string | null;
  last_action_at: string | null;
  comment_deadline: string | null;
  event_at: string | null;
  /** State bills signed into law; absent on rows from before the column existed. */
  enacted_at?: string | null;
  external_id: string;
  source: string;
};

export type FeedAnalysis = {
  /** Null/absent for analyses made before analyze-v2. */
  headline?: string | null;
  impacts?: ImpactInput[] | null;
  summary: string;
  why_it_matters: string | null;
  topics: string[];
  affected_groups: string[];
  keywords: string[];
  significance: number;
};

export type Candidate = { item: FeedItem; analysis: FeedAnalysis; my_official_ids: string[] };

export type Interest = { label: string; topic_slugs: string[]; keywords: string[]; is_pet: boolean };

export type UserContext = {
  interests: Interest[];
  groups: AffectedGroup[];
  /** Raw onboarding answers, so skipped questions can be asked later. */
  demographics?: Demographics;
  /** Answers to specific facts, and the registry entries the candidates reference. */
  answers?: Answers;
  registry?: Registry;
  jurisdictionIds: string[];
  actedItemIds: Set<string>;
  /** The user's "is this relevant?" votes, by item id. */
  votes?: Map<string, boolean>;
  /** Per-topic lean learned from those votes (see learnTopicAffinity). */
  affinity?: Map<string, number>;
  now: Date;
};

export type Ranked = Candidate & {
  score: number;
  reasons: string[];
  deadline: Date | null;
  daysLeft: number | null;
  petMatch: boolean;
  acted: boolean;
  /** The user's own verdict on this item, if they gave one. */
  vote: boolean | null;
  impact: PersonalImpact;
};

const DAY = 86_400_000;

function containsKeyword(haystack: string, kw: string): boolean {
  const k = kw.toLowerCase().trim();
  if (k.length < 3) return false;
  // word-boundary match so "park" doesn't hit "parking"
  const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?($|[^a-z0-9])`);
  return re.test(haystack);
}

export function deadlineOf(item: FeedItem): Date | null {
  const d = item.comment_deadline ?? item.event_at;
  return d ? new Date(d) : null;
}

export type InterestMatch = { interest: Interest; topicHit?: string; kwHit?: string };

/** Which of the user's interests this item hits, by topic tag or keyword. */
export function matchInterests(c: Pick<Candidate, "item" | "analysis">, interests: Interest[]): InterestMatch[] {
  const { item, analysis } = c;
  const itemTopics = new Set(expandTopics(analysis.topics));
  const haystack = `${item.title} ${analysis.summary} ${analysis.keywords.join(" ")} ${item.agency ?? ""}`.toLowerCase();
  return interests.flatMap((interest) => {
    const topicHit = interest.topic_slugs.find((t) => itemTopics.has(t));
    const kwHit = interest.keywords.find((k) => containsKeyword(haystack, k));
    return topicHit || kwHit ? [{ interest, topicHit, kwHit }] : [];
  });
}

export type Vote = { relevant: boolean; topics: string[] };

/**
 * Net lean per topic from the user's votes: +1 for each item marked relevant, -1 for each marked not relevant.
 * Topics that cancel out are dropped.
 */
export function learnTopicAffinity(votes: Vote[]): Map<string, number> {
  const affinity = new Map<string, number>();
  for (const v of votes) for (const t of new Set(v.topics)) affinity.set(t, (affinity.get(t) ?? 0) + (v.relevant ? 1 : -1));
  for (const [t, n] of affinity) if (n === 0) affinity.delete(t);
  return affinity;
}

/**
 * How much votes on similar items move this one. A topic the user marked relevant pulls hard (+2 per net vote),
 * so one vote can bring similar items in. Pushing down is gentler and needs a pattern: a topic only counts
 * against an item after two net "not relevant" votes, since one rejected item often says more about that item
 * than its (broad) topic. Capped at +6 / -4.
 */
export function affinityPoints(topics: string[], affinity: Map<string, number> | undefined): number {
  if (!affinity?.size) return 0;
  const pts = [...new Set(topics)].reduce((s, t) => {
    const n = affinity.get(t) ?? 0;
    return s + (n > 0 ? 2 * n : n <= -2 ? n : 0);
  }, 0);
  return Math.max(-4, Math.min(6, pts));
}

/** Points for an item the user explicitly marked relevant: enough to clear MIN_SCORE on its own. */
const VOTED_RELEVANT = 12;

export function scoreCandidate(c: Candidate, u: UserContext): Ranked | null {
  const { item, analysis } = c;
  const reasons: string[] = [];
  let score = 0;
  let petMatch = false;

  const vote = u.votes?.get(item.id) ?? null;
  if (vote === false) return null;
  if (vote) {
    score += VOTED_RELEVANT;
    reasons.push("You marked this relevant");
  }

  const deadline = deadlineOf(item);
  const daysLeft = deadline ? Math.ceil((deadline.getTime() - u.now.getTime()) / DAY) : null;
  // Deadline passed and nothing else is happening → not actionable.
  if (daysLeft !== null && daysLeft < 0 && item.type === "comment_period") return null;

  // Interests: pet issues dominate.
  let topicPoints = 0;
  const matches = matchInterests(c, u.interests);
  for (const { interest: it, topicHit, kwHit } of matches) {
    if (it.is_pet) {
      // keyword hits are much stronger evidence than a broad topic overlap
      score += kwHit ? 14 : 8;
      petMatch = true;
      reasons.push(`Your pet issue: ${it.label}`);
    } else {
      topicPoints += kwHit ? 4 : 3;
      if (reasons.length < 4) reasons.push(`You follow ${topicHit ? topicName(topicHit) : it.label}`);
    }
  }
  score += Math.min(topicPoints, 8);

  if (c.my_official_ids.length) {
    score += 6;
    reasons.push("Your representative is involved");
  }

  if (item.level === "city" || item.level === "county") {
    if (item.jurisdiction_id && u.jurisdictionIds.includes(item.jurisdiction_id)) {
      score += 4;
      reasons.push("Happening in your city");
    }
  } else if (item.level === "state") {
    score += 1;
  }

  const groupHits = analysis.affected_groups.filter((g) => u.groups.includes(g as AffectedGroup));
  if (groupHits.length) {
    score += Math.min(groupHits.length * 2, 4);
    reasons.push(`Affects ${groupHits.map((g) => AFFECTED_GROUPS[g as AffectedGroup].toLowerCase()).join(", ")}`);
  }

  score += analysis.significance;

  if (daysLeft !== null && daysLeft >= 0) {
    if (daysLeft <= 3) score += 8;
    else if (daysLeft <= 7) score += 5;
    else if (daysLeft <= 14) score += 3;
    else score += 2;
  } else if (item.last_action_at) {
    const age = u.now.getTime() - new Date(item.last_action_at).getTime();
    if (age < 7 * DAY) score += 2;
    else if (age < 21 * DAY) score += 1;
  }

  const impact = impactFor(c, u, matches);
  // An answer the user gave ("I ride BART") that this item specifically depends on.
  const viaFact = impact.facets.filter((f) => f.viaFact);
  if (viaFact.length) {
    score += Math.min(viaFact.reduce((s, f) => s + f.magnitude * 2, 0), 8);
    reasons.push(`Affects you because ${viaFact[0].because[0]}`);
  }

  // Votes on other items with the same topics. Only counts for items the user hasn't judged directly.
  const learned = vote === null ? affinityPoints(analysis.topics, u.affinity) : 0;
  score += learned;
  if (learned > 0) reasons.push("Similar to items you marked relevant");

  // Locality, urgency, and rep sponsorship alone don't make a minor item relevant: it must connect to the
  // user's issues/profile somehow, unless it's a major item in their jurisdiction.
  const connected =
    vote === true || learned > 0 || petMatch || topicPoints > 0 || groupHits.length > 0 || viaFact.length > 0;
  if (!connected && analysis.significance < 4) return null;

  const acted = u.actedItemIds.has(item.id);
  if (acted) score -= 10;

  return { ...c, score, reasons: [...new Set(reasons)], deadline, daysLeft, petMatch, acted, vote, impact };
}

function impactFor(c: Candidate, u: UserContext, matches: InterestMatch[]): PersonalImpact {
  return personalImpact(c.analysis.impacts, {
    groups: u.groups,
    matched: matches.map((m) => m.interest),
    demographics: u.demographics,
    answers: u.answers,
    registry: u.registry,
  });
}

export const MIN_SCORE = 8;

export const FEED_LEVELS = ["all", "city", "state", "federal"] as const;

export type FeedLevel = (typeof FEED_LEVELS)[number];

export const FEED_SECTION_LIMIT = 15;

export function matchesLevel(item: Pick<FeedItem, "level">, level: FeedLevel): boolean {
  return level === "all" || item.level === level || (level === "city" && item.level === "county");
}

/** Count uncapped non-acted matches across the mutually exclusive level tabs. */
export function countByLevel(ranked: Pick<Ranked, "item" | "acted">[]): Record<FeedLevel, number> {
  const counts: Record<FeedLevel, number> = { all: 0, city: 0, state: 0, federal: 0 };
  for (const r of ranked) {
    if (r.acted) continue;
    counts.all++;
    if (matchesLevel(r.item, "city")) counts.city++;
    else if (r.item.level === "state") counts.state++;
    else counts.federal++;
  }
  return counts;
}

export type FeedSections = {
  actNow: Ranked[];
  radar: Ranked[];
  done: Ranked[];
};

export type FeedSectionTotals = {
  actNow: number;
  radar: number;
  done: number;
};

export type SectionedFeed = FeedSections & {
  totals: FeedSectionTotals;
};

export function sectionRanked(ranked: Ranked[], limitPerSection = FEED_SECTION_LIMIT): SectionedFeed {
  const feed: FeedSections = { actNow: [], radar: [], done: [] };
  for (const r of ranked) {
    if (r.acted) feed.done.push(r);
    else if (r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= 14) feed.actNow.push(r);
    else feed.radar.push(r);
  }
  feed.actNow.sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99) || b.score - a.score);
  return {
    actNow: feed.actNow.slice(0, limitPerSection),
    radar: feed.radar.slice(0, limitPerSection),
    done: feed.done.slice(0, limitPerSection),
    totals: {
      actNow: feed.actNow.length,
      radar: feed.radar.length,
      done: feed.done.length,
    },
  };
}

export type Feed = SectionedFeed & {
  /** All items that cleared MIN_SCORE (sorted by score), before section slicing, so level tabs don't starve. */
  ranked: Ranked[];
  questions: RankedQuestion[];
  /** Items that cleared MIN_SCORE, including ones cut by the per-section limit. */
  rankedIds: Set<string>;
  /** Items actually shown in a section. */
  shownIds: Set<string>;
};

export function buildFeed(candidates: Candidate[], u: UserContext, limitPerSection = FEED_SECTION_LIMIT): Feed {
  const scored = candidates.map((c) => ({ c, r: scoreCandidate(c, u) }));
  const ranked = scored
    .map((x) => x.r)
    .filter((r): r is Ranked => !!r && (r.score >= MIN_SCORE || r.acted))
    .sort((a, b) => b.score - a.score);

  // Questions come from what's in the feed, plus (weakly) local items we hid only because we couldn't
  // yet tell they affect the user: answering is how those get in.
  const shown = new Set(ranked.map((r) => r.item.id));
  const hidden = scored
    .filter((x) => !shown.has(x.c.item.id) && u.votes?.get(x.c.item.id) !== false)
    .filter((x) => !(x.c.item.type === "comment_period" && x.r === null && isClosed(x.c.item, u.now)))
    .map((x) => ({ score: 1, impact: x.r?.impact ?? impactFor(x.c, u, []) }));
  const questions = rankOpenQuestions([...ranked.filter((r) => !r.acted), ...hidden]);

  const sections = sectionRanked(ranked, limitPerSection);
  return {
    ...sections,
    ranked,
    questions,
    rankedIds: shown,
    shownIds: new Set([sections.actNow, sections.radar, sections.done].flatMap((rs) => rs.map((r) => r.item.id))),
  };
}

/** Why an indexed item is or isn't in the user's feed, for the Browse page. */
export type FeedStatus = "in_feed" | "acted" | "not_relevant" | "outside_area" | "inactive" | "ranked_lower" | "no_match";

export function feedStatus(
  itemId: string,
  where: { inArea: boolean; active: boolean; vote: boolean | null },
  feed: Pick<Feed, "rankedIds" | "shownIds" | "done">,
): FeedStatus {
  if (where.vote === false) return "not_relevant";
  if (feed.done.some((r) => r.item.id === itemId)) return "acted";
  if (feed.shownIds.has(itemId)) return "in_feed";
  if (!where.inArea) return "outside_area";
  if (!where.active) return "inactive";
  if (feed.rankedIds.has(itemId)) return "ranked_lower";
  return "no_match";
}

function isClosed(item: FeedItem, now: Date): boolean {
  const d = deadlineOf(item);
  return !!d && d.getTime() < now.getTime();
}
