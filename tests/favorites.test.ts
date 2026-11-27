import { describe, expect, it } from "vitest";
import { favoriteUpdate, needsAttention, sortFavorites, type FavoriteRecord, type ItemProgressSnapshot } from "@/lib/favorites";

const baseItem = (over: Partial<ItemProgressSnapshot> = {}): ItemProgressSnapshot => ({
  status: "In Committee",
  last_action: "Referred to Transportation Committee",
  last_action_at: "2026-11-10",
  enacted_at: null,
  comment_deadline: null,
  event_at: null,
  ...over,
});

const baseFav = (over: Partial<FavoriteRecord> = {}): FavoriteRecord => ({
  item_id: "item-1",
  created_at: "2026-11-12T10:00:00Z",
  last_seen_at: "2026-11-12T10:00:00Z",
  last_seen_status: "In Committee",
  last_seen_action: "Referred to Transportation Committee",
  last_seen_action_at: "2026-11-10",
  last_seen_enacted_at: null,
  last_seen_deadline: null,
  ...over,
});

describe("favoriteUpdate", () => {
  it("reports no change when progress fields match snapshot", () => {
    const upd = favoriteUpdate(baseItem(), baseFav());
    expect(upd.changed).toBe(false);
    expect(upd.summary).toBeNull();
  });

  it("treats equivalent UTC timestamp formats as equal", () => {
    const upd = favoriteUpdate(
      baseItem({ comment_deadline: "2026-12-01T00:00:00+00:00" }),
      baseFav({ last_seen_deadline: "2026-12-01T00:00:00.000Z" }),
    );
    expect(upd.changed).toBe(false);
    expect(upd.summary).toBeNull();
  });

  it("detects enacted_at, deadlines, status changes, and legislative activity", () => {
    expect(favoriteUpdate(baseItem({ enacted_at: "2026-11-25" }), baseFav())).toMatchObject({
      changed: true,
      summary: "Signed into law",
    });

    expect(favoriteUpdate(baseItem({ comment_deadline: "2026-12-05T23:59:00Z" }), baseFav())).toMatchObject({
      changed: true,
      summary: "New comment deadline",
    });

    expect(favoriteUpdate(baseItem({ event_at: "2026-12-05T18:00:00Z" }), baseFav())).toMatchObject({
      changed: true,
      summary: "New hearing or agenda date",
    });

    expect(favoriteUpdate(baseItem({ status: "Passed House" }), baseFav())).toMatchObject({
      changed: true,
      summary: "Status updated: Passed House",
    });

    expect(
      favoriteUpdate(baseItem({ last_action: "Scheduled for floor vote", last_action_at: "2026-11-22" }), baseFav()),
    ).toMatchObject({
      changed: true,
      summary: "New activity: Scheduled for floor vote",
    });

    expect(
      favoriteUpdate(baseItem({ last_action: null, last_action_at: "2026-11-22" }), baseFav({ last_seen_action: null })),
    ).toMatchObject({
      changed: true,
      summary: "New legislative activity",
    });
  });

  it("does not report an update when a previously seen field becomes null", () => {
    const upd = favoriteUpdate(
      baseItem({ status: null, last_action: null, last_action_at: null }),
      baseFav(),
    );
    expect(upd.changed).toBe(false);
    expect(upd.summary).toBeNull();
  });

  it("computes deterministic fingerprints that change when progress changes", () => {
    const f1 = favoriteUpdate(baseItem(), baseFav()).fingerprint;
    const f2 = favoriteUpdate(baseItem(), baseFav()).fingerprint;
    const f3 = favoriteUpdate(baseItem({ status: "Passed House" }), baseFav()).fingerprint;
    expect(f1).toBe(f2);
    expect(f3).not.toBe(f1);
  });
});

describe("needsAttention", () => {
  const unchanged = { changed: false, summary: null, fingerprint: "x" };
  const changed = { changed: true, summary: "Status updated: Passed", fingerprint: "y" };

  it("flags updated favorites and upcoming deadlines within 14 days", () => {
    expect(needsAttention({ update: changed, daysLeft: null })).toBe(true);
    expect(needsAttention({ update: unchanged, daysLeft: 0 })).toBe(true);
    expect(needsAttention({ update: unchanged, daysLeft: 14 })).toBe(true);
    expect(needsAttention({ update: unchanged, daysLeft: 15 })).toBe(false);
    expect(needsAttention({ update: unchanged, daysLeft: -1 })).toBe(false);
    expect(needsAttention({ update: unchanged, daysLeft: null })).toBe(false);
  });
});

describe("sortFavorites", () => {
  const unchanged = { changed: false, summary: null, fingerprint: "x" };
  const changed = { changed: true, summary: "Status updated: Passed", fingerprint: "y" };

  it("orders by updated first, then soonest open deadline, then latest activity, then favorited date", () => {
    const rows = [
      { id: "old-fav", update: unchanged, daysLeft: null, item: { last_action_at: "2026-11-01" }, favoritedAt: "2026-11-02T00:00:00Z" },
      { id: "new-fav", update: unchanged, daysLeft: null, item: { last_action_at: "2026-11-01" }, favoritedAt: "2026-11-10T00:00:00Z" },
      { id: "recent-act", update: unchanged, daysLeft: null, item: { last_action_at: "2026-11-18" }, favoritedAt: "2026-11-01T00:00:00Z" },
      { id: "deadline-10", update: unchanged, daysLeft: 10, item: { last_action_at: "2026-11-01" }, favoritedAt: "2026-11-01T00:00:00Z" },
      { id: "deadline-2", update: unchanged, daysLeft: 2, item: { last_action_at: "2026-11-01" }, favoritedAt: "2026-11-01T00:00:00Z" },
      { id: "closed-dl", update: unchanged, daysLeft: -2, item: { last_action_at: "2026-11-19" }, favoritedAt: "2026-11-01T00:00:00Z" },
      { id: "updated", update: changed, daysLeft: null, item: { last_action_at: "2026-11-01" }, favoritedAt: "2026-11-01T00:00:00Z" },
    ];
    expect(sortFavorites(rows).map((r) => r.id)).toEqual([
      "updated",
      "deadline-2",
      "deadline-10",
      "closed-dl",
      "recent-act",
      "new-fav",
      "old-fav",
    ]);
  });
});
