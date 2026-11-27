import { describe, expect, it } from "vitest";
import { affinityPoints, buildFeed, countByLevel, feedStatus, learnTopicAffinity, matchesLevel, scoreCandidate, sectionRanked, type Candidate, type UserContext } from "@/lib/relevance";

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
    analysis: { headline: "", impacts: [], summary: "", why_it_matters: null, topics: [], affected_groups: [], keywords: [], significance: 3, ...analysis },
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
      {
        topics: ["public-lands/climbing-access"],
        significance: 3,
        impacts: [{ facet: "environment", magnitude: 2, direction: "benefit", groups: ["outdoor-recreationists"], note: "Keeps existing anchors" }],
      },
    );
    const other = cand({ title: "Tax Relief Act" }, { topics: ["economy/taxes"], significance: 5 });
    const a = scoreCandidate(nps, user)!;
    const b = scoreCandidate(other, user)!;
    expect(a.petMatch).toBe(true);
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.reasons).toContain("Your pet issue: Climbing access in national parks");
    expect(a.impact.level).toBe("high"); // base 2 + "you spend time outdoors"
    expect(a.impact.facets[0]).toMatchObject({ facet: "environment", magnitude: 3 });
    expect(a.impact.facets[0].because).toEqual(["you spend time outdoors", "your pet issue: Climbing access in national parks"]);
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

  it("scores open comment periods closing in >14 days high enough to reach the feed", () => {
    const rule = cand(
      { id: "fr-open", type: "comment_period", level: "federal", comment_deadline: inDays(30) },
      { topics: ["transportation/transit"], significance: 3 },
    );
    const feed = buildFeed([rule], user);
    expect(feed.radar.map((r) => r.item.id)).toEqual(["fr-open"]);

    const minor = cand(
      { id: "fr-minor", type: "comment_period", level: "federal", comment_deadline: inDays(30) },
      { topics: ["transportation/transit"], significance: 2 },
    );
    expect(buildFeed([minor], user).radar).toHaveLength(0);
  });

  it("keeps major federal bills matching a followed topic when latest action was 14 days ago", () => {
    const bill = cand(
      { id: "cg-14d", level: "federal", last_action_at: inDays(-14).slice(0, 10) },
      { topics: ["transportation/transit"], significance: 4 },
    );
    expect(buildFeed([bill], user).radar.map((r) => r.item.id)).toEqual(["cg-14d"]);
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

  it("preserves federal items for level tabs even when city items fill the all-levels cap", () => {
    const cities = Array.from({ length: 20 }, (_, i) =>
      cand(
        { id: `city-${i}`, level: "city", jurisdiction_id: "ocd-division/country:us/state:wa/place:seattle", type: "agenda_item" },
        { topics: ["transportation/transit"], significance: 4 },
      ),
    );
    const fed = cand(
      { id: "fed-1", level: "federal", type: "comment_period", comment_deadline: inDays(30) },
      { topics: ["transportation/transit"], significance: 3 },
    );
    const feed = buildFeed([...cities, fed], user, 15);
    expect(feed.radar.some((r) => r.item.id === "fed-1")).toBe(false);
    const fedOnly = sectionRanked(feed.ranked.filter((r) => matchesLevel(r.item, "federal")), 15);
    expect(fedOnly.radar.map((r) => r.item.id)).toEqual(["fed-1"]);
  });

  it("counts uncapped non-acted matches by level so city + state + federal equals all", () => {
    const items = [
      ...Array.from({ length: 16 }, (_, i) =>
        cand(
          { id: `city-${i}`, level: "city", jurisdiction_id: "ocd-division/country:us/state:wa/place:seattle", type: "agenda_item" },
          { topics: ["transportation/transit"], significance: 4 },
        ),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        cand(
          { id: `county-${i}`, level: "county", jurisdiction_id: "ocd-division/country:us/state:wa/place:seattle", type: "agenda_item" },
          { topics: ["transportation/transit"], significance: 4 },
        ),
      ),
      ...Array.from({ length: 17 }, (_, i) =>
        cand({ id: `state-${i}`, level: "state" }, { topics: ["transportation/transit"], significance: 4 }),
      ),
      ...Array.from({ length: 18 }, (_, i) =>
        cand({ id: `fed-${i}`, level: "federal" }, { topics: ["transportation/transit"], significance: 5 }),
      ),
      cand(
        { id: "city-acted", level: "city", jurisdiction_id: "ocd-division/country:us/state:wa/place:seattle" },
        { topics: ["transportation/transit"], significance: 5 },
      ),
      cand({ id: "fed-acted", level: "federal" }, { topics: ["transportation/transit"], significance: 5 }),
    ];

    const feed = buildFeed(items, { ...user, actedItemIds: new Set(["city-acted", "fed-acted"]) }, 15);
    const counts = countByLevel(feed.ranked);
    expect(counts).toEqual({ all: 53, city: 18, state: 17, federal: 18 });
    expect(counts.city + counts.state + counts.federal).toBe(counts.all);
  });

  it("returns uncapped section totals while slicing shownIds to limitPerSection", () => {
    const items = [
      ...Array.from({ length: 3 }, (_, i) =>
        cand(
          { id: `act-${i}`, level: "federal", type: "comment_period", comment_deadline: inDays(i + 1) },
          { topics: ["transportation/transit"], significance: 4 },
        ),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        cand({ id: `rep-${i}`, level: "state" }, { topics: ["transportation/transit"], significance: 4 }, ["rep-1"]),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        cand({ id: `radar-${i}`, level: "federal" }, { topics: ["transportation/transit"], significance: 5 }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        cand({ id: `done-${i}`, level: "federal" }, { topics: ["transportation/transit"], significance: 5 }),
      ),
    ];

    const feed = buildFeed(items, { ...user, actedItemIds: new Set(["done-0", "done-1", "done-2"]) }, 2);
    expect(feed.actNow).toHaveLength(2);
    expect(feed.radar).toHaveLength(2);
    expect(feed.done).toHaveLength(2);
    expect(feed.totals).toEqual({ actNow: 3, followingUp: 0, radar: 9, done: 3 });
    expect(feed.shownIds.size).toBe(6);

    const counts = countByLevel(feed.ranked);
    expect(feed.totals.actNow + feed.totals.followingUp + feed.totals.radar).toBe(counts.all);

    const fedOnly = sectionRanked(feed.ranked.filter((r) => matchesLevel(r.item, "federal")), 2);
    expect(fedOnly.totals).toEqual({ actNow: 3, followingUp: 0, radar: 5, done: 3 });
    expect(fedOnly.totals.actNow + fedOnly.totals.followingUp + fedOnly.totals.radar).toBe(counts.federal);

    const where = { inArea: true, active: true, vote: null };
    expect(feedStatus("radar-4", where, feed)).toBe("ranked_lower");
  });

  it("boosts rep-involved items in radar when they match interests, but excludes minor unrelated rep bills", () => {
    const unrelatedRepBill = cand(
      { id: "rep-unrelated", level: "federal" },
      { topics: ["government/postal"], significance: 2 },
      ["rep-1"],
    );
    expect(scoreCandidate(unrelatedRepBill, user)).toBeNull();

    const matchedRepBill = cand(
      { id: "rep-matched", level: "federal" },
      { topics: ["transportation/transit"], significance: 3 },
      ["rep-1"],
    );
    const matchedOtherBill = cand(
      { id: "other-matched", level: "federal" },
      { topics: ["transportation/transit"], significance: 3 },
    );
    const feed = buildFeed([matchedOtherBill, matchedRepBill], user);
    expect(feed.radar.map((r) => r.item.id)).toEqual(["rep-matched", "other-matched"]);
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

describe("facts in the feed", () => {
  const bart = {
    key: "rides_bart",
    question: "Do you ride BART?",
    you_phrase: "you ride BART",
    answer_type: "bool" as const,
    options: [],
    topics: ["transportation/transit"],
    facets: ["mobility"],
    canonical_key: null,
  };
  const fareItem = () =>
    cand(
      { title: "BART fare increase", level: "state", jurisdiction_id: null },
      {
        significance: 3,
        impacts: [{ facet: "mobility", magnitude: 3, direction: "cost", groups: [], note: "Raises fares 10%", applies_if: { fact_key: "rides_bart", when: ["yes"] } }],
      },
    );
  const plain: UserContext = { ...user, interests: [], groups: [], demographics: {}, registry: new Map([[bart.key, bart]]) };

  it("a matching answer connects an item that otherwise wouldn't show, and says why", () => {
    expect(scoreCandidate(fareItem(), { ...plain, answers: {} })).toBeNull();
    const r = scoreCandidate(fareItem(), { ...plain, answers: { rides_bart: "yes" } })!;
    expect(r.reasons).toContain("Affects you because you ride BART");
    expect(r.impact.facets[0].viaFact).toBe(true);
  });

  it("asks about hidden items too, since answering is how they get in", () => {
    const feed = buildFeed([fareItem()], { ...plain, answers: {} });
    expect(feed.radar).toHaveLength(0);
    expect(feed.questions).toEqual([expect.objectContaining({ key: "rides_bart", itemCount: 1 })]);
    expect(buildFeed([fareItem()], { ...plain, answers: { rides_bart: "no" } }).questions).toEqual([]);
  });
});

describe("relevance votes", () => {
  const unrelated = () => cand({ id: "u1", title: "Postal Facility Naming Act" }, { topics: ["government/postal"], significance: 2 });

  it("an item marked relevant shows even with no other connection, and says why", () => {
    const c = unrelated();
    expect(scoreCandidate(c, user)).toBeNull();
    const r = scoreCandidate(c, { ...user, votes: new Map([["u1", true]]) })!;
    expect(r.vote).toBe(true);
    expect(r.reasons).toContain("You marked this relevant");
    expect(buildFeed([c], { ...user, votes: new Map([["u1", true]]) }).radar.map((x) => x.item.id)).toEqual(["u1"]);
  });

  it("an item marked not relevant is dropped, even a pet-issue match, and isn't asked about", () => {
    const pet = cand({ id: "p1", title: "Climbing fixed anchors rule" }, { topics: ["public-lands/climbing-access"] });
    expect(scoreCandidate(pet, user)).not.toBeNull();
    const u = { ...user, votes: new Map([["p1", false]]) };
    expect(scoreCandidate(pet, u)).toBeNull();
    const feed = buildFeed([pet], u);
    expect(feed.rankedIds.size).toBe(0);
    expect(feed.questions).toEqual([]);
  });

  it("learns a per-topic lean that cancels out on mixed votes", () => {
    const a = learnTopicAffinity([
      { relevant: true, topics: ["government/postal", "economy"] },
      { relevant: true, topics: ["government/postal"] },
      { relevant: false, topics: ["economy", "health"] },
    ]);
    expect(Object.fromEntries(a)).toEqual({ "government/postal": 2, health: -1 });
    expect(affinityPoints(["government/postal"], a)).toBe(4);
    expect(affinityPoints(["government/postal", "x"], a)).toBe(4);
    expect(affinityPoints(["y"], new Map([["y", 9]]))).toBe(6); // capped
  });

  it("one rejection doesn't push down a whole topic; a pattern of them does", () => {
    expect(affinityPoints(["health"], new Map([["health", -1]]))).toBe(0);
    expect(affinityPoints(["health"], new Map([["health", -2]]))).toBe(-2);
    expect(affinityPoints(["health", "economy"], new Map([["health", -3], ["economy", -3]]))).toBe(-4); // capped
  });

  it("items like ones marked relevant get pulled in; ones like rejected ones get pushed down", () => {
    const similar = unrelated();
    const affinity = new Map([["government/postal", 2]]);
    const r = scoreCandidate(similar, { ...user, affinity })!;
    expect(r.reasons).toContain("Similar to items you marked relevant");

    const transit = cand({ id: "t1" }, { topics: ["transportation/transit"], significance: 3 });
    const base = scoreCandidate(transit, user)!.score;
    expect(scoreCandidate(transit, { ...user, affinity: new Map([["transportation/transit", -1]]) })!.score).toBe(base);
    expect(scoreCandidate(transit, { ...user, affinity: new Map([["transportation/transit", -3]]) })!.score).toBe(base - 3);
  });

  it("explains why an indexed item is or isn't in the feed", () => {
    const shown = cand({ id: "s1" }, { topics: ["transportation/transit"], significance: 5 });
    const feed = buildFeed([shown], user);
    const where = { inArea: true, active: true, vote: null };
    expect(feedStatus("s1", where, feed)).toBe("in_feed");
    expect(feedStatus("s1", { ...where, vote: false }, feed)).toBe("not_relevant");
    expect(feedStatus("x", { ...where, inArea: false }, feed)).toBe("outside_area");
    expect(feedStatus("x", { ...where, active: false }, feed)).toBe("inactive");
    expect(feedStatus("x", where, feed)).toBe("no_match");

    const many = Array.from({ length: 3 }, (_, i) => cand({ id: `m${i}` }, { topics: ["transportation/transit"], significance: 5 }));
    const capped = buildFeed(many, user, 2);
    expect(feedStatus("m2", where, capped)).toBe("ranked_lower");
  });
});

describe("favorites in the feed", () => {
  it("routes a favorited item with no other connection into followingUp", () => {
    const unrelated = cand({ id: "fav-1", title: "Lighthouse Preservation Act" }, { topics: ["government/postal"], significance: 1 });
    expect(scoreCandidate(unrelated, user)).toBeNull();

    const feed = buildFeed([unrelated], { ...user, favoritedIds: new Set(["fav-1"]) });
    expect(feed.followingUp.map((r) => r.item.id)).toEqual(["fav-1"]);
    expect(feed.followingUp[0].favorited).toBe(true);
    expect(feed.followingUp[0].reasons).toContain("You favorited this to follow up on");
  });

  it("places urgent favorited items in actNow ahead of equally urgent non-favorited items", () => {
    const plainSoon = cand(
      { id: "soon-plain", type: "comment_period", comment_deadline: inDays(4) },
      { topics: ["transportation/transit"], significance: 3 },
    );
    const favSoon = cand(
      { id: "soon-fav", type: "comment_period", comment_deadline: inDays(4) },
      { topics: ["government/postal"], significance: 2 },
    );
    const feed = buildFeed([plainSoon, favSoon], { ...user, favoritedIds: new Set(["soon-fav"]) });
    expect(feed.actNow.map((r) => r.item.id)).toEqual(["soon-fav", "soon-plain"]);
    expect(feed.followingUp).toHaveLength(0);
  });

  it("keeps acted favorited items in followingUp rather than done and keeps level counts aligned", () => {
    const actedFav = cand({ id: "acted-fav", level: "federal" }, { topics: ["transportation/transit"], significance: 3 });
    const actedOther = cand({ id: "acted-other", level: "federal" }, { topics: ["transportation/transit"], significance: 4 });
    const feed = buildFeed([actedFav, actedOther], {
      ...user,
      favoritedIds: new Set(["acted-fav"]),
      actedItemIds: new Set(["acted-fav", "acted-other"]),
    });
    expect(feed.followingUp.map((r) => r.item.id)).toEqual(["acted-fav"]);
    expect(feed.done.map((r) => r.item.id)).toEqual(["acted-other"]);
    const counts = countByLevel(feed.ranked);
    expect(feed.totals.actNow + feed.totals.followingUp + feed.totals.radar).toBe(counts.all);
  });

  it("retains closed comment periods when favorited", () => {
    const closed = cand({ id: "closed-fav", type: "comment_period", comment_deadline: inDays(-3) }, { significance: 2 });
    const feed = buildFeed([closed], { ...user, favoritedIds: new Set(["closed-fav"]) });
    expect(feed.followingUp.map((r) => r.item.id)).toEqual(["closed-fav"]);
  });

  it("reports favorited status in feedStatus regardless of area or activity", () => {
    const feed = buildFeed([], user);
    expect(feedStatus("x", { inArea: false, active: false, vote: null, favorited: true }, feed)).toBe("favorited");
  });
});
