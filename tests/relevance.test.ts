import { describe, expect, it } from "vitest";
import { buildFeed, scoreCandidate, type Candidate, type UserContext } from "@/lib/relevance";

const now = new Date("2026-11-20T12:00:00Z");
const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

function cand(over: Partial<Candidate["item"]>, analysis: Partial<Candidate["analysis"]> = {}, mine: string[] = []): Candidate {
  return {
    item: {
      id: over.id ?? Math.random().toString(36),
      type: "bill",
      level: "federal",
      jurisdiction_id: "ocd-division/country:us",
      title: "A bill",
      url: null,
      agency: null,
      status: null,
      last_action: null,
      last_action_at: inDays(-2).slice(0, 10),
      comment_deadline: null,
      event_at: null,
      external_id: "x",
      source: "test",
      ...over,
    },
    analysis: { summary: "", why_it_matters: null, topics: [], affected_groups: [], keywords: [], significance: 3, ...analysis },
    my_official_ids: mine,
  };
}

const user: UserContext = {
  interests: [
    { label: "Climbing access in national parks", topic_slugs: ["public-lands/climbing-access"], keywords: ["climbing", "fixed anchors"], is_pet: true },
    { label: "Public Transit", topic_slugs: ["transportation/transit"], keywords: [], is_pet: false },
  ],
  groups: ["renters", "outdoor-recreationists"],
  jurisdictionIds: ["ocd-division/country:us", "ocd-division/country:us/state:wa/place:seattle"],
  actedItemIds: new Set(),
  now,
};

describe("scoreCandidate", () => {
  it("ranks a pet-issue NPS comment period above an unrelated significant bill", () => {
    const nps = cand(
      { type: "comment_period", title: "Wilderness Climbing Management; Fixed Anchors", agency: "National Park Service", comment_deadline: inDays(20) },
      { topics: ["public-lands/climbing-access"], significance: 3 },
    );
    const other = cand({ title: "Tax Relief Act" }, { topics: ["economy/taxes"], significance: 5 });
    const a = scoreCandidate(nps, user)!;
    const b = scoreCandidate(other, user)!;
    expect(a.petMatch).toBe(true);
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.reasons).toContain("Your pet issue: Climbing access in national parks");
  });

  it("matches keywords on word boundaries", () => {
    const parking = cand({ title: "Parking garage bonds" }, {});
    const r = scoreCandidate(parking, { ...user, interests: [{ label: "parks", topic_slugs: [], keywords: ["park"], is_pet: true }] });
    expect(r?.petMatch ?? false).toBe(false);
  });

  it("drops comment periods whose deadline has passed", () => {
    expect(scoreCandidate(cand({ type: "comment_period", comment_deadline: inDays(-1) }), user)).toBeNull();
  });

  it("credits local items, involved reps and affected groups", () => {
    const local = cand(
      { level: "city", jurisdiction_id: "ocd-division/country:us/state:wa/place:seattle", type: "agenda_item", event_at: inDays(2) },
      { affected_groups: ["renters"], topics: ["housing/renters-rights"] },
      ["legistar:seattle:1"],
    );
    const r = scoreCandidate(local, user)!;
    expect(r.reasons).toEqual(expect.arrayContaining(["Your representative is involved", "Happening in your city", "Affects renters"]));
  });
});

describe("buildFeed", () => {
  it("puts deadlines within 14 days in Act now, soonest first, and acted items in Done", () => {
    const soon = cand({ id: "soon", type: "comment_period", comment_deadline: inDays(3) }, { topics: ["transportation/transit"] });
    const later = cand({ id: "later", type: "comment_period", comment_deadline: inDays(10) }, { topics: ["public-lands/climbing-access"] });
    const far = cand({ id: "far", type: "comment_period", comment_deadline: inDays(40) }, { topics: ["public-lands/climbing-access"] });
    const done = cand({ id: "done" }, { topics: ["public-lands/climbing-access"], significance: 5 });
    const feed = buildFeed([far, later, soon, done], { ...user, actedItemIds: new Set(["done"]) });
    expect(feed.actNow.map((r) => r.item.id)).toEqual(["soon", "later"]);
    expect(feed.radar.map((r) => r.item.id)).toEqual(["far"]);
    expect(feed.done.map((r) => r.item.id)).toEqual(["done"]);
  });

  it("excludes local items with a deadline but no connection to the user", () => {
    const unrelated = cand(
      { level: "city", jurisdiction_id: "ocd-division/country:us/state:wa/place:seattle", type: "agenda_item", event_at: inDays(1) },
      { topics: ["justice-safety/emergency-services"], significance: 3 },
    );
    expect(scoreCandidate(unrelated, user)).toBeNull();
    expect(scoreCandidate({ ...unrelated, analysis: { ...unrelated.analysis, significance: 4 } }, user)).not.toBeNull();
  });

  it("filters out low-relevance items", () => {
    const boring = cand({ title: "Post office naming" }, { significance: 1 });
    const feed = buildFeed([boring], user);
    expect(feed.radar).toHaveLength(0);
  });
});
