import { describe, expect, it } from "vitest";
import { badgeProgress, levelForPoints, newlyEarnedBadges, weeklyStreak, type ActionRecord } from "@/lib/gamification";

const now = new Date("2026-11-20T12:00:00Z"); // a Friday
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const act = (over: Partial<ActionRecord>): ActionRecord => ({
  type: "emailed", created_at: daysAgo(0), item_id: Math.random().toString(36), item_level: "federal", item_type: "bill", item_topics: [], ...over,
});

describe("weeklyStreak", () => {
  it("counts consecutive weeks with a voice action", () => {
    expect(weeklyStreak([act({ created_at: daysAgo(0) }), act({ created_at: daysAgo(7) }), act({ created_at: daysAgo(14) })], now)).toBe(3);
  });
  it("doesn't break a streak just because this week has no action yet", () => {
    expect(weeklyStreak([act({ created_at: daysAgo(7) }), act({ created_at: daysAgo(14) })], now)).toBe(2);
  });
  it("ignores reads and gaps", () => {
    expect(weeklyStreak([act({ type: "read" }), act({ created_at: daysAgo(21) })], now)).toBe(0);
  });
});

describe("badges", () => {
  it("awards First Contact once", () => {
    const ctx = { actions: [act({})], petTopics: [], now };
    expect(newlyEarnedBadges(ctx, []).map((b) => b.slug)).toContain("first-contact");
    expect(newlyEarnedBadges(ctx, ["first-contact"]).map((b) => b.slug)).not.toContain("first-contact");
  });
  it("All Three Levels counts county as local", () => {
    const actions = [act({ item_level: "county" }), act({ item_level: "state" }), act({ item_level: "federal" })];
    expect(newlyEarnedBadges({ actions, petTopics: [], now }, []).map((b) => b.slug)).toContain("all-three-levels");
  });
  it("Pet-Issue Guardian needs 3 distinct pet items", () => {
    const pet = (id: string) => act({ item_id: id, item_topics: ["public-lands/climbing-access", "public-lands"] });
    const ctx = (ids: string[]) => ({ actions: ids.map(pet), petTopics: ["public-lands/climbing-access"], now });
    expect(newlyEarnedBadges(ctx(["a", "b"]), []).map((b) => b.slug)).not.toContain("pet-issue-guardian");
    expect(newlyEarnedBadges(ctx(["a", "b", "c"]), []).map((b) => b.slug)).toContain("pet-issue-guardian");
  });
});

describe("levelForPoints", () => {
  it("steps through tiers with current floor", () => {
    expect(levelForPoints(0)).toMatchObject({ level: 1, title: "Newcomer", current: 0, next: 25 });
    expect(levelForPoints(30)).toMatchObject({ level: 2, current: 25, next: 100 });
    expect(levelForPoints(250)).toMatchObject({ level: 4, current: 250, next: 600 });
    expect(levelForPoints(10_000)).toMatchObject({ level: 5, current: 600, next: null });
  });
});

describe("badgeProgress", () => {
  it("computes progress for each badge", () => {
    const actions = [
      act({ type: "read", item_id: "r1" }),
      act({ type: "read", item_id: "r2" }),
      act({ type: "commented", item_id: "c1", item_type: "comment_period", item_level: "federal" }),
      act({ type: "emailed", item_id: "p1", item_level: "county", item_topics: ["public-lands/climbing-access", "public-lands"] }),
    ];
    const ctx = { actions, petTopics: ["public-lands/climbing-access"], now };
    expect(badgeProgress("first-contact", ctx)).toEqual({ current: 1, target: 1, unit: "action" });
    expect(badgeProgress("well-informed", ctx)).toEqual({ current: 2, target: 20, unit: "summaries read" });
    expect(badgeProgress("comment-champion", ctx)).toEqual({ current: 1, target: 5, unit: "comments" });
    expect(badgeProgress("all-three-levels", ctx)).toEqual({ current: 2, target: 3, unit: "levels" });
    expect(badgeProgress("pet-issue-guardian", ctx)).toEqual({ current: 1, target: 3, unit: "actions" });
    expect(badgeProgress("steady-voice", ctx)).toEqual({ current: 1, target: 4, unit: "weeks" });
  });
});
