/**
 * Which learned facts come up most, to decide what (if anything) is worth promoting into onboarding.
 * For each canonical fact: how many still-active items depend on it, and how many users answered or declined.
 *
 *   npm run facts:report
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Impact } from "@/lib/ai/analyze";

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const recent = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: facts, error }, { data: analyses }, { data: answers }] = await Promise.all([
    db.from("facts").select("key, question, source, canonical_key"),
    db
      .from("item_analysis")
      .select("impacts, items!inner(comment_deadline, event_at, last_action_at)")
      .or(`comment_deadline.gt.${today},event_at.gt.${today},last_action_at.gt.${recent}`, { referencedTable: "items" })
      .limit(20_000),
    db.from("user_facts").select("fact_key, value").limit(100_000),
  ]);
  if (error) throw error;

  const items = new Map<string, number>();
  for (const a of analyses ?? []) {
    const keys = new Set((a.impacts as unknown as Impact[]).flatMap((i) => (i.applies_if ? [i.applies_if.fact_key] : [])));
    for (const k of keys) items.set(k, (items.get(k) ?? 0) + 1);
  }
  const answered = new Map<string, { yes: number; declined: number }>();
  for (const a of answers ?? []) {
    const c = answered.get(a.fact_key) ?? { yes: 0, declined: 0 };
    if (a.value === null) c.declined++;
    else c.yes++;
    answered.set(a.fact_key, c);
  }

  const rows = (facts ?? [])
    .filter((f) => !f.canonical_key)
    .map((f) => ({ ...f, items: items.get(f.key) ?? 0, ...(answered.get(f.key) ?? { yes: 0, declined: 0 }) }))
    .sort((a, b) => b.items - a.items || b.yes - a.yes);

  console.log(`${rows.length} facts (${(facts ?? []).length - rows.length} merged away)\n`);
  console.log("active items  answered  declined  key — question");
  for (const r of rows.slice(0, 50)) {
    console.log(`${String(r.items).padStart(12)}  ${String(r.yes).padStart(8)}  ${String(r.declined).padStart(8)}  ${r.key} — ${r.question}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
