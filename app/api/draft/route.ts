import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiConfigured } from "@/lib/ai/client";
import { streamDraft } from "@/lib/ai/draft";
import { LAW_RESPONSE_IDS, LAW_RESPONSES } from "@/lib/ai/draftPrompt";
import { placeName } from "@/lib/place";

export const runtime = "nodejs";

const Body = z.object({
  itemId: z.uuid(),
  officialId: z.string().max(200).nullable(),
  kind: z.enum(["email", "call_script", "public_comment"]),
  stance: z.enum(["support", "oppose", "concerned", "question"]),
  lawResponse: z.enum(LAW_RESPONSE_IDS).optional(),
  personalNote: z.string().trim().min(10, "Add a sentence about why this matters to you.").max(600),
});

const DAILY_LIMIT = parseInt(process.env.DRAFT_DAILY_LIMIT ?? "10", 10);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to draft messages." }, { status: 401 });
  if (!aiConfigured()) return NextResponse.json({ error: "AI drafting isn't enabled on this server. Use “Copy prompt” instead." }, { status: 503 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const b = parsed.data;

  const [{ data: item }, { data: official }, { data: profile }] = await Promise.all([
    supabase.from("items").select("title, description, type, url, external_id, agency, comment_deadline, status, enacted_at, item_analysis(summary)").eq("id", b.itemId).maybeSingle(),
    b.officialId ? supabase.from("officials").select("name, office").eq("id", b.officialId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("profiles").select("jurisdiction_ids, state").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  const lawResponse = item.enacted_at ? b.lawResponse : undefined;
  if (item.enacted_at && (!lawResponse || b.kind === "public_comment")) {
    return NextResponse.json({ error: "Choose a follow-up goal for your message to a legislator." }, { status: 400 });
  }
  const stance = lawResponse ? LAW_RESPONSES[lawResponse].stance : b.stance;

  const admin = createAdminClient();
  const { data: allowed, error: quotaErr } = await admin.rpc("consume_draft_quota", { p_user: user.id, p_limit: DAILY_LIMIT });
  if (quotaErr) return NextResponse.json({ error: "Try again in a moment." }, { status: 500 });
  if (!allowed) {
    return NextResponse.json(
      { error: `You've used today's ${DAILY_LIMIT} AI drafts. Use “Copy prompt” to draft with any AI assistant, or come back tomorrow.` },
      { status: 429 },
    );
  }

  const { text, done } = streamDraft({
    kind: b.kind,
    stance,
    lawResponse,
    personalNote: b.personalNote,
    item: { ...item, summary: item.item_analysis?.summary || item.description },
    official,
    place: placeName(profile?.jurisdiction_ids ?? [], profile?.state ?? null),
  });

  done
    .then(({ content, model }) =>
      admin.from("drafts").insert({
        user_id: user.id,
        item_id: b.itemId,
        official_id: b.officialId,
        kind: b.kind,
        stance,
        personal_note: b.personalNote,
        content,
        model,
      }),
    )
    .catch((err) => console.error("draft failed", err));

  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
