import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiConfigured } from "@/lib/ai/client";
import { assessmentHash, normalizeAssessment, runAssessment, type Assessment } from "@/lib/ai/assess";
import { factKeysOf, getAnswers, getRegistry } from "@/lib/data";
import { placeName } from "@/lib/place";
import { expandTopics, type Demographics } from "@/lib/taxonomy";
import type { Fact } from "@/lib/facts";
import type { ImpactInput } from "@/lib/impact";

export const runtime = "nodejs";

const Body = z.object({ itemId: z.uuid() });
const DAILY_LIMIT = parseInt(process.env.ASSESS_DAILY_LIMIT ?? "10", 10);

export type AssessResponse = { assessment: Assessment; cached: boolean; hash: string } | { error: string };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sign in to use this." }, 401);
  if (!aiConfigured()) return json({ error: "AI isn't enabled on this server." }, 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request" }, 400);
  const { itemId } = parsed.data;

  const [{ data: item }, { data: profile }, answers] = await Promise.all([
    supabase
      .from("items")
      .select("title, type, level, agency, status, description, item_analysis(headline, summary, why_it_matters, impacts, topics, prompt_version, created_at)")
      .eq("id", itemId)
      .maybeSingle(),
    supabase.from("profiles").select("demographics, jurisdiction_ids, state").eq("user_id", user.id).maybeSingle(),
    getAnswers(supabase, user.id),
  ]);
  if (!item) return json({ error: "Item not found" }, 404);
  const a = item.item_analysis;
  const impacts = (a?.impacts ?? []) as unknown as ImpactInput[];
  const demographics = (profile?.demographics ?? {}) as Demographics;

  const hash = assessmentHash({ demographics, answers, analysisVersion: `${a?.prompt_version ?? "none"}:${a?.created_at ?? ""}` });
  const { data: cached } = await supabase
    .from("personal_assessments")
    .select("result")
    .eq("user_id", user.id)
    .eq("item_id", itemId)
    .eq("facts_hash", hash)
    .maybeSingle();
  if (cached) return json({ assessment: cached.result as unknown as Assessment, cached: true, hash });

  const admin = createAdminClient();
  const { data: allowed, error: quotaErr } = await admin.rpc("consume_ai_quota", { p_user: user.id, p_kind: "assess", p_limit: DAILY_LIMIT });
  if (quotaErr) return json({ error: "Try again in a moment." }, 500);
  if (!allowed) return json({ error: `You've used today's ${DAILY_LIMIT} personal assessments. Come back tomorrow.` }, 429);

  const topics = expandTopics(a?.topics ?? []);
  const [registry, { data: nearby }] = await Promise.all([
    getRegistry(supabase, [...factKeysOf(impacts), ...Object.keys(answers)]),
    topics.length
      ? supabase.from("facts").select("key, question, you_phrase, answer_type, options, topics, facets, canonical_key").is("canonical_key", null).overlaps("topics", topics).limit(60)
      : Promise.resolve({ data: [] }),
  ]);
  for (const f of (nearby ?? []) as Fact[]) if (!registry.has(f.key)) registry.set(f.key, f);

  let run;
  try {
    run = await runAssessment({
      item: {
        title: item.title,
        headline: a?.headline ?? null,
        type: item.type,
        level: item.level,
        agency: item.agency,
        status: item.status,
        summary: a?.summary ?? null,
        why_it_matters: a?.why_it_matters ?? null,
        description: item.description,
      },
      place: placeName(profile?.jurisdiction_ids ?? [], profile?.state ?? null),
      impacts,
      demographics,
      answers,
      registry,
      nearbyFacts: (nearby ?? []) as Fact[],
    });
  } catch (err) {
    console.error("assess failed", err);
    return json({ error: "Couldn't run the assessment. Try again in a moment." }, 502);
  }
  if ("refused" in run) return json({ error: "The AI couldn't assess this item. Read the summary and source instead." }, 422);

  const { assessment, newFacts } = normalizeAssessment(run.output, registry, answers);
  if (newFacts.length) {
    await admin
      .from("facts")
      .upsert(newFacts.map(({ canonical_key: _c, ...f }) => ({ ...f, source: "agent", created_from_item: itemId })), { onConflict: "key", ignoreDuplicates: true });
  }
  await admin.from("personal_assessments").upsert({
    user_id: user.id,
    item_id: itemId,
    facts_hash: hash,
    result: assessment,
    model: run.model,
  });
  return json({ assessment, cached: false, hash });
}

function json(body: AssessResponse, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
