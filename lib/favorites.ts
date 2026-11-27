/** Pure helpers for favorited issues: snapshots, update detection, attention checks, and sorting. */

export type ItemProgressSnapshot = {
  status: string | null;
  last_action: string | null;
  last_action_at: string | null;
  enacted_at?: string | null;
  comment_deadline: string | null;
  event_at: string | null;
};

export type FavoriteRecord = {
  item_id: string;
  created_at: string;
  last_seen_at: string;
  last_seen_status: string | null;
  last_seen_action: string | null;
  last_seen_action_at: string | null;
  last_seen_enacted_at: string | null;
  last_seen_deadline: string | null;
};

export type FavoriteUpdate = {
  changed: boolean;
  summary: string | null;
  fingerprint: string;
};

const cleanText = (s: string | null | undefined): string | null => {
  const t = s?.trim();
  return t ? t : null;
};

export function deadlineIso(item: Pick<ItemProgressSnapshot, "comment_deadline" | "event_at">): string | null {
  return item.comment_deadline ?? item.event_at ?? null;
}

export function parseMs(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

/** Captures an item's current progress fields for saving onto item_favorites. */
export function favoriteSnapshot(item: ItemProgressSnapshot) {
  return {
    last_seen_status: cleanText(item.status),
    last_seen_action: cleanText(item.last_action),
    last_seen_action_at: cleanText(item.last_action_at),
    last_seen_enacted_at: cleanText(item.enacted_at),
    last_seen_deadline: deadlineIso(item),
    last_seen_at: new Date().toISOString(),
  };
}

/** Detects whether a favorited item has meaningful new progress since the user last checked it. */
export function favoriteUpdate(item: ItemProgressSnapshot, fav: FavoriteRecord): FavoriteUpdate {
  const status = cleanText(item.status);
  const seenStatus = cleanText(fav.last_seen_status);
  const action = cleanText(item.last_action);
  const seenAction = cleanText(fav.last_seen_action);
  const actionAt = cleanText(item.last_action_at);
  const seenActionAt = cleanText(fav.last_seen_action_at);
  const enactedAt = cleanText(item.enacted_at);
  const seenEnactedAt = cleanText(fav.last_seen_enacted_at);
  const deadlineMs = parseMs(deadlineIso(item));
  const seenDeadlineMs = parseMs(fav.last_seen_deadline);

  const fingerprint = [
    enactedAt ?? "",
    actionAt ?? "",
    deadlineMs ?? "",
    (status ?? "").slice(0, 60),
    (action ?? "").slice(0, 80),
  ]
    .join("|")
    .slice(0, 200);

  let summary: string | null = null;
  if (enactedAt && enactedAt !== seenEnactedAt) {
    summary = "Signed into law";
  } else if (deadlineMs !== null && deadlineMs !== seenDeadlineMs) {
    summary = item.comment_deadline ? "New comment deadline" : "New hearing or agenda date";
  } else if (status && status !== seenStatus) {
    summary = `Status updated: ${status}`;
  } else if ((action && action !== seenAction) || (actionAt && actionAt !== seenActionAt)) {
    summary = action ? `New activity: ${action}` : "New legislative activity";
  }

  return { changed: Boolean(summary), summary, fingerprint };
}

/** True when a favorited item has an unread update or an upcoming deadline within 14 days. */
export function needsAttention(entry: { update: FavoriteUpdate; daysLeft: number | null }): boolean {
  return entry.update.changed || (entry.daysLeft !== null && entry.daysLeft >= 0 && entry.daysLeft <= 14);
}

/** Orders favorited items by unread update, soonest open deadline, latest activity, then newest favorite. */
export function sortFavorites<
  T extends {
    update: FavoriteUpdate;
    daysLeft: number | null;
    item: { last_action_at: string | null; enacted_at?: string | null };
    favoritedAt: string;
  },
>(rows: T[]): T[] {
  const openDays = (d: number | null) => (d !== null && d >= 0 ? d : Number.POSITIVE_INFINITY);
  return [...rows].sort((a, b) => {
    if (a.update.changed !== b.update.changed) return a.update.changed ? -1 : 1;
    const da = openDays(a.daysLeft);
    const db = openDays(b.daysLeft);
    if (da !== db) return da - db;
    const actA = parseMs(a.item.last_action_at ?? a.item.enacted_at) ?? 0;
    const actB = parseMs(b.item.last_action_at ?? b.item.enacted_at) ?? 0;
    if (actA !== actB) return actB - actA;
    return (parseMs(b.favoritedAt) ?? 0) - (parseMs(a.favoritedAt) ?? 0);
  });
}
