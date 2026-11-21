/**
 * Ranks feed candidates for one user. No LLM: everything comes from per-item analysis
 * tags computed once and the user's profile. `feed_candidates()` in SQL does the coarse prefilter.
 */
import { AFFECTED_GROUPS, expandTopics, topicName, type AffectedGroup } from "@/lib/taxonomy";
import { personalImpact, type ImpactInput, type PersonalImpact } from "@/lib/impact";

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
  jurisdictionIds: string[];
  actedItemIds: Set<string>;
  now: Date;
};

export type Ranked = Candidate & {
  score: number;
  reasons: string[];
  deadline: Date | null;
  daysLeft: number | null;
  petMatch: boolean;
  acted: boolean;
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

export function scoreCandidate(c: Candidate, u: UserContext): Ranked | null {
  const { item, analysis } = c;
  const reasons: string[] = [];
  let score = 0;
  let petMatch = false;

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
  } else if (item.last_action_at && u.now.getTime() - new Date(item.last_action_at).getTime() < 7 * DAY) {
    score += 2;
  }

  // Locality and urgency alone don't make an item relevant: it must connect to the user somehow,
  // unless it's a major item in their jurisdiction.
  const connected = petMatch || topicPoints > 0 || c.my_official_ids.length > 0 || groupHits.length > 0;
  if (!connected && analysis.significance < 4) return null;

  const acted = u.actedItemIds.has(item.id);
  if (acted) score -= 10;

  const impact = personalImpact(analysis.impacts, { groups: u.groups, matched: matches.map((m) => m.interest) });

  return { ...c, score, reasons: [...new Set(reasons)], deadline, daysLeft, petMatch, acted, impact };
}

export const MIN_SCORE = 8;

export type Feed = { actNow: Ranked[]; yourReps: Ranked[]; radar: Ranked[]; done: Ranked[] };

export function buildFeed(candidates: Candidate[], u: UserContext, limitPerSection = 15): Feed {
  const ranked = candidates
    .map((c) => scoreCandidate(c, u))
    .filter((r): r is Ranked => !!r && (r.score >= MIN_SCORE || r.acted))
    .sort((a, b) => b.score - a.score);

  const feed: Feed = { actNow: [], yourReps: [], radar: [], done: [] };
  for (const r of ranked) {
    if (r.acted) feed.done.push(r);
    else if (r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= 14) feed.actNow.push(r);
    else if (r.my_official_ids.length) feed.yourReps.push(r);
    else feed.radar.push(r);
  }
  feed.actNow.sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99) || b.score - a.score);
  return {
    actNow: feed.actNow.slice(0, limitPerSection),
    yourReps: feed.yourReps.slice(0, limitPerSection),
    radar: feed.radar.slice(0, limitPerSection),
    done: feed.done.slice(0, limitPerSection),
  };
}
