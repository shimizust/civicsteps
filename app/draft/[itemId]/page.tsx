import { notFound, redirect } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { getMyOfficials, getProfile } from "@/lib/data";
import { aiConfigured } from "@/lib/ai/client";
import { contactsOf, phoneNumbersOf } from "@/lib/civic/officials";
import { placeName } from "@/lib/place";
import { BackLink } from "@/components/BackLink";
import { Kicker, LEVEL_LABEL, PageTitle } from "@/components/ui";
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
    supabase
      .from("items")
      .select(
        "id, title, description, type, url, action_url, external_id, agency, comment_deadline, level, status, enacted_at, item_analysis(summary, why_it_matters, arguments_for, arguments_against, topics, model)",
      )
      .eq("id", itemId)
      .maybeSingle(),
    getMyOfficials(supabase, user.id),
    getProfile(supabase, user.id),
  ]);
  if (!item) notFound();

  const isComment = item.type === "comment_period";
  const relevant = officials.filter((o) =>
    item.level === "city" || item.level === "county" ? ["city", "county"].includes(o.level) : o.level === item.level,
  );
  const official = relevant.find((o) => o.id === sp.official) ?? relevant[0] ?? null;

  const reference = (
    <div className="space-y-3">
      <Kicker className="block">
        {LEVEL_LABEL[item.level]} · {typeLabel(item)}
        {item.agency ? ` · ${item.agency}` : ""}
      </Kicker>
      {item.status && <p className="text-xs text-muted">Status: {item.status}</p>}
      <IssueSummary analysis={item.item_analysis} description={item.description} url={item.url} />
    </div>
  );

  return (
    <div>
      <BackLink fallbackHref={`/items/${item.id}`} fallbackLabel="Back to item" className="mb-3" />
      <PageTitle sub={item.title}>{isComment ? "Write a public comment" : `Message ${official?.name ?? "your representative"}`}</PageTitle>

      {/* Mobile: collapsible issue reference so Composer starts immediately above the fold */}
      <details className="group mb-6 rounded-xl border border-line bg-card p-4 lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium">
          <span>Issue reference</span>
          <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-4">{reference}</div>
      </details>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <Composer
            aiEnabled={aiConfigured()}
            isComment={isComment}
            item={{
              id: item.id,
              title: item.title,
              type: item.type,
              url: item.url,
              external_id: item.external_id,
              agency: item.agency,
              comment_deadline: item.comment_deadline,
              enacted_at: item.enacted_at,
              status: item.status,
              summary: item.item_analysis?.summary || item.description,
              action_url: item.action_url,
            }}
            officials={relevant.map((o) => {
              const c = contactsOf(o);
              const phones = phoneNumbersOf(c);
              return {
                id: o.id,
                name: o.name,
                office: o.office,
                email: c.emails?.[0] ?? null,
                form: c.contact_form_url ?? null,
                phone: phones[0]?.phone ?? null,
                phones: phones.map((p) => ({ label: p.label, phone: p.phone })),
              };
            })}
            initialOfficialId={official?.id ?? null}
            initialKind={isComment ? "public_comment" : sp.kind === "call_script" ? "call_script" : "email"}
            place={placeName(profile?.jurisdiction_ids ?? [], profile?.state ?? null)}
          />
        </div>

        {/* Desktop: sticky reference panel beside the composer */}
        <aside className="hidden lg:sticky lg:top-20 lg:block" aria-label="Issue details">
          {reference}
        </aside>
      </div>
    </div>
  );
}
