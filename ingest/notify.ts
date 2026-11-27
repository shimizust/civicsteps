/**
 * Email alerts, run after ingestion:
 *   - new_pet_item:    something new matched a pet issue (created in the last 2 days)
 *   - deadline_soon:   a pet-issue or favorited-issue deadline is ≤ 3 days away
 *   - favorite_update: a favorited issue had a status, deadline, or activity update
 *   - digest:          Mondays (or --digest), top items for the week
 * Deduped through notifications_sent, so re-running is safe.
 *
 *   npm run notify            npm run notify -- --digest
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { buildFeed, type Candidate, type Ranked } from "@/lib/relevance";
import { favoriteUpdate } from "@/lib/favorites";
import { groupsForDemographics, type Demographics } from "@/lib/taxonomy";
import { VOICE_ACTIONS, weekIndex, type ActionType } from "@/lib/gamification";
import { renderEmail, sendEmail } from "@/lib/email";

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const now = new Date();
const DIGEST = process.argv.includes("--digest") || now.getUTCDay() === 1;
const DAY = 86_400_000;

async function candidates(): Promise<Candidate[]> {
  // Shared candidate set for everyone: upcoming deadlines + recently changed items.
  const { data, error } = await db
    .from("items")
    .select("*, item_analysis!inner(headline, impacts, summary, why_it_matters, topics, affected_groups, keywords, significance), item_officials(official_id)")
    .or(`comment_deadline.gt.${now.toISOString()},event_at.gt.${now.toISOString()},last_action_at.gt.${new Date(now.getTime() - 7 * DAY).toISOString().slice(0, 10)}`)
    .limit(5000);
  if (error) throw error;
  return data.map(({ item_analysis, item_officials, ...item }) => ({
    item: item as Candidate["item"],
    analysis: item_analysis as Candidate["analysis"],
    my_official_ids: item_officials.map((o) => o.official_id), // narrowed per user below
  }));
}

async function allUsers() {
  const users: { id: string; email: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users.filter((u) => u.email).map((u) => ({ id: u.id, email: u.email! })));
    if (data.users.length < 1000) break;
  }
  return users;
}

async function alreadySent(userId: string, kind: string, period: string, itemIds: string[]) {
  const { data } = await db.from("notifications_sent").select("item_id").eq("user_id", userId).eq("kind", kind).eq("period", period).in("item_id", itemIds.length ? itemIds : ["00000000-0000-0000-0000-000000000000"]);
  return new Set((data ?? []).map((d) => d.item_id));
}

const EMPTY_ANALYSIS: Candidate["analysis"] = {
  headline: null,
  impacts: [],
  summary: "",
  why_it_matters: null,
  topics: [],
  affected_groups: [],
  keywords: [],
  significance: 3,
};

async function fetchMissingFavorites(ids: string[]): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db
      .from("items")
      .select("*, item_analysis(headline, impacts, summary, why_it_matters, topics, affected_groups, keywords, significance), item_officials(official_id)")
      .in("id", ids.slice(i, i + 100));
    if (error) throw error;
    for (const { item_analysis, item_officials, ...item } of data ?? []) {
      out.push({
        item: item as Candidate["item"],
        analysis: (item_analysis as Candidate["analysis"] | null) ?? { ...EMPTY_ANALYSIS, summary: item.description ?? "" },
        my_official_ids: item_officials.map((o) => o.official_id),
      });
    }
  }
  return out;
}

async function main() {
  const [cands, users, profilesRes, interestsRes, officialsRes, actionsRes, favoritesRes] = await Promise.all([
    candidates(),
    allUsers(),
    db.from("profiles").select("*").not("onboarded_at", "is", null),
    db.from("user_interests").select("user_id, label, topic_slugs, keywords, is_pet"),
    db.from("user_officials").select("user_id, official_id"),
    db.from("user_actions").select("user_id, item_id, type"),
    db.from("item_favorites").select("*"),
  ]);
  if (favoritesRes.error) throw favoritesRes.error;

  const favorites = favoritesRes.data ?? [];
  const candIds = new Set(cands.map((c) => c.item.id));
  const missingFavIds = [...new Set(favorites.map((f) => f.item_id))].filter((id) => !candIds.has(id));
  if (missingFavIds.length) cands.push(...(await fetchMissingFavorites(missingFavIds)));

  const emailOf = new Map(users.map((u) => [u.id, u.email]));
  let sent = 0;

  for (const p of profilesRes.data ?? []) {
    const email = emailOf.get(p.user_id);
    if (!email || (!p.notify_alerts && !p.notify_digest)) continue;
    const mine = new Set((officialsRes.data ?? []).filter((o) => o.user_id === p.user_id).map((o) => o.official_id));
    const userFavs = favorites.filter((f) => f.user_id === p.user_id);
    const favoritedIds = new Set(userFavs.map((f) => f.item_id));
    const userCands = cands.map((c) => ({ ...c, my_official_ids: c.my_official_ids.filter((id) => mine.has(id)) }));
    const feed = buildFeed(
      userCands,
      {
        interests: (interestsRes.data ?? []).filter((i) => i.user_id === p.user_id),
        groups: groupsForDemographics(p.demographics as Demographics),
        jurisdictionIds: p.jurisdiction_ids,
        actedItemIds: new Set((actionsRes.data ?? []).filter((a) => a.user_id === p.user_id && a.item_id && VOICE_ACTIONS.includes(a.type as ActionType)).map((a) => a.item_id!)),
        favoritedIds,
        now,
      },
      50,
    );
    const open = [...feed.actNow, ...feed.followingUp, ...feed.radar];

    if (p.notify_alerts) {
      const fresh = open.filter((r) => r.petMatch && (r.item as unknown as { created_at: string }).created_at > new Date(now.getTime() - 2 * DAY).toISOString());
      const soon = open.filter((r) => (r.petMatch || r.favorited) && r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= 3);
      for (const [kind, list, heading, intro] of [
        ["new_pet_item", fresh, "New on your pet issues", "Something new just came up on an issue you told us you care about."],
        ["deadline_soon", soon, "Deadline coming up", "Time is almost up to weigh in on these. A short, personal message makes a difference."],
      ] as const) {
        const skip = await alreadySent(p.user_id, kind, "", list.map((r) => r.item.id));
        const todo = (list as Ranked[]).filter((r) => !skip.has(r.item.id)).slice(0, 5);
        if (!todo.length) continue;
        const subject = kind === "deadline_soon" ? `⏰ ${todo[0].item.title.slice(0, 70)}` : `★ ${todo.length} new on your pet issues`;
        if (await sendEmail(email, subject, renderEmail({ heading, intro, items: todo }))) {
          await db.from("notifications_sent").insert(todo.map((r) => ({ user_id: p.user_id, item_id: r.item.id, kind, period: "" })));
          sent++;
        }
      }

      const rankedById = new Map(feed.ranked.map((r) => [r.item.id, r]));
      const changedFavs = userFavs.flatMap((fav) => {
        const ranked = rankedById.get(fav.item_id);
        if (!ranked) return [];
        const upd = favoriteUpdate(ranked.item, fav);
        return upd.changed && upd.summary ? [{ ranked, upd }] : [];
      });
      if (changedFavs.length) {
        const { data: sentRows } = await db
          .from("notifications_sent")
          .select("item_id, period")
          .eq("user_id", p.user_id)
          .eq("kind", "favorite_update")
          .in("item_id", changedFavs.map((x) => x.ranked.item.id));
        const sentKeys = new Set((sentRows ?? []).map((s) => `${s.item_id}:${s.period}`));
        const todo = changedFavs.filter((x) => !sentKeys.has(`${x.ranked.item.id}:${x.upd.fingerprint}`)).slice(0, 5);
        if (todo.length) {
          const itemNotes = new Map(todo.map((x) => [x.ranked.item.id, x.upd.summary!]));
          const subject =
            todo.length === 1
              ? `Update on favorited issue: ${todo[0].ranked.item.title.slice(0, 60)}`
              : `${todo.length} updates on issues you favorited`;
          const html = renderEmail({
            heading: "Updates on your favorited issues",
            intro: "Something changed on an issue you saved to keep following up on.",
            items: todo.map((x) => x.ranked),
            itemNotes,
            ctaHref: "/favorites",
            ctaLabel: "Open my favorites",
          });
          if (await sendEmail(email, subject, html)) {
            await db.from("notifications_sent").insert(
              todo.map((x) => ({
                user_id: p.user_id,
                item_id: x.ranked.item.id,
                kind: "favorite_update",
                period: x.upd.fingerprint,
              })),
            );
            sent++;
          }
        }
      }
    }

    if (p.notify_digest && DIGEST) {
      const period = `w${weekIndex(now)}`;
      const { count } = await db.from("notifications_sent").select("user_id", { count: "exact", head: true }).eq("user_id", p.user_id).eq("kind", "digest").eq("period", period);
      const top = open.slice(0, 8);
      if (!count && top.length) {
        const html = renderEmail({ heading: "Your week in civics", intro: `${feed.actNow.length} deadlines in the next two weeks on issues you follow.`, items: top });
        if (await sendEmail(email, "Your week in civics", html)) {
          await db.from("notifications_sent").insert({ user_id: p.user_id, item_id: null, kind: "digest", period });
          sent++;
        }
      }
    }
  }
  console.log(`[notify] ${sent} emails sent${process.env.RESEND_API_KEY ? "" : " (dry run: RESEND_API_KEY not set)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
