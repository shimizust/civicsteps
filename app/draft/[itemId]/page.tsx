import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getMyOfficials, getProfile } from "@/lib/data";
import { aiConfigured } from "@/lib/ai/client";
import { contactsOf } from "@/lib/civic/officials";
import { placeName } from "@/lib/place";
import { LEVEL_LABEL, PageTitle, Pill } from "@/components/ui";
import { IssueSummary } from "@/components/IssueSummary";
import { typeLabel } from "@/components/ItemCard";
import { Composer } from "./Composer";

export default async function DraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ official?: string; kind?: string }>;
}) {
  const [{ itemId }, sp] = await Promise.all([params, searchParams]);
  const { supabase, user } = await requireUser();
  if (!user) redirect(`/login?next=/draft/${itemId}`);

  const [{ data: item }, officials, profile] = await Promise.all([
    supabase.from("items").select("id, title, description, type, url, action_url, external_id, agency, comment_deadline, level, status, enacted_at, item_analysis(summary, why_it_matters, arguments_for, arguments_against, topics, model)").eq("id", itemId).maybeSingle(),
    getMyOfficials(supabase, user.id),
    getProfile(supabase, user.id),
  ]);
  if (!item) notFound();

  const isComment = item.type === "comment_period";
  const relevant = officials.filter((o) => (item.level === "city" || item.level === "county" ? ["city", "county"].includes(o.level) : o.level === item.level));
  const official = relevant.find((o) => o.id === sp.official) ?? relevant[0] ?? null;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/items/${item.id}`} className="text-sm text-muted hover:text-accent">← Back</Link>
      <PageTitle sub={item.title}>{isComment ? "Write a public comment" : `Message ${official?.name ?? "your representative"}`}</PageTitle>
      <section aria-label="Issue details" className="mb-6 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Pill>{LEVEL_LABEL[item.level]}</Pill>
          <Pill>{typeLabel(item)}</Pill>
          {item.agency && <Pill>{item.agency}</Pill>}
        </div>
        {item.status && <p className="text-sm text-muted">{item.status}</p>}
        <IssueSummary analysis={item.item_analysis} description={item.description} url={item.url} />
      </section>
      <Composer
        aiEnabled={aiConfigured()}
        isComment={isComment}
        item={{
          id: item.id, title: item.title, type: item.type, url: item.url, external_id: item.external_id,
          agency: item.agency, comment_deadline: item.comment_deadline, enacted_at: item.enacted_at,
          status: item.status, summary: item.item_analysis?.summary || item.description, action_url: item.action_url,
        }}
        officials={relevant.map((o) => {
          const c = contactsOf(o);
          return {
            id: o.id, name: o.name, office: o.office,
            email: c.emails?.[0] ?? null,
            form: c.contact_form_url ?? null,
            phone: c.phones?.[0] ?? c.offices?.find((office) => office.phone)?.phone ?? null,
          };
        })}
        initialOfficialId={official?.id ?? null}
        initialKind={isComment ? "public_comment" : sp.kind === "call_script" ? "call_script" : "email"}
        place={placeName(profile?.jurisdiction_ids ?? [], profile?.state ?? null)}
      />
    </div>
  );
}
