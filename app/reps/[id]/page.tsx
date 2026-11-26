import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Phone } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { contactsOf } from "@/lib/civic/officials";
import { BackLink } from "@/components/BackLink";
import { OfficialCard } from "@/components/OfficialCard";
import { Card, Empty, Kicker, LEVEL_LABEL, Pill, SectionTitle } from "@/components/ui";

export default async function RepPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/reps");

  const [{ data: o }, { data: activity }] = await Promise.all([
    supabase.from("officials").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("item_officials")
      .select("role, vote, items!inner(id, title, status, last_action_at, level, item_analysis(headline))")
      .eq("official_id", id)
      .order("last_action_at", { referencedTable: "items", ascending: false })
      .limit(25),
  ]);
  if (!o) notFound();
  const c = contactsOf(o);

  return (
    <div>
      <BackLink fallbackHref="/reps" fallbackLabel="All representatives" className="mb-4" />
      <OfficialCard o={o} hero />

      {c.offices && c.offices.length > 0 && (
        <>
          <SectionTitle>Offices</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {c.offices.map((off, i) => (
              <Card key={i} className="text-sm">
                <p className="font-medium">{off.name}</p>
                {off.address && <p className="mt-1 text-muted">{off.address}</p>}
                {off.phone && (
                  <a
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded text-accent tabular-nums hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    href={`tel:${off.phone.replace(/[^\d+]/g, "")}`}
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    {off.phone}
                  </a>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {c.website && (
        <p className="mt-4 text-sm">
          <a
            className="inline-flex items-center gap-1.5 rounded text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            href={c.website}
            target="_blank"
            rel="noreferrer"
          >
            Official website <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </p>
      )}

      <SectionTitle hint="Most recent first">Recent activity</SectionTitle>
      {activity?.length ? (
        <ul className="space-y-2.5">
          {activity.map((a) => {
            const headline = a.items.item_analysis?.headline?.trim() || a.items.title;
            const showRaw = headline !== a.items.title;
            return (
              <li key={`${a.items.id}-${a.role}`}>
                <Link
                  href={`/items/${a.items.id}`}
                  className="block rounded-xl border border-line bg-card p-3.5 transition hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <Kicker>{LEVEL_LABEL[a.items.level]}</Kicker>
                    <Pill tone="accent" className="capitalize">
                      {a.role}
                      {a.vote ? `: ${a.vote}` : ""}
                    </Pill>
                    {a.items.last_action_at && (
                      <span className="ml-auto text-xs tabular-nums text-muted">
                        {new Date(a.items.last_action_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 font-medium leading-snug">{headline}</p>
                  {showRaw && <p className="mt-0.5 truncate text-xs text-muted">{a.items.title}</p>}
                  {a.items.status && <p className="mt-1 text-xs text-muted">{a.items.status}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>No tracked activity yet. Sponsorships appear here as bills are ingested.</Empty>
      )}
    </div>
  );
}
