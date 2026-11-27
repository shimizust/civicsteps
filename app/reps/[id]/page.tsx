import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Phone } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { getOfficialActivity } from "@/lib/data";
import { contactsOf } from "@/lib/civic/officials";
import { BackLink } from "@/components/BackLink";
import { OfficialCard } from "@/components/OfficialCard";
import { Card, Empty, Kicker, LEVEL_LABEL, Pill, SectionTitle } from "@/components/ui";

export default async function RepPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/reps");

  const [{ data: o }, activityByOfficial] = await Promise.all([
    supabase.from("officials").select("*").eq("id", id).maybeSingle(),
    getOfficialActivity(supabase, [id], 50),
  ]);
  if (!o) notFound();
  const c = contactsOf(o);
  const activity = activityByOfficial[id] ?? [];

  return (
    <div>
      <BackLink fallbackHref="/reps" fallbackLabel="All representatives" className="mb-4" />
      <OfficialCard o={o} hero />

      {c.offices && c.offices.length > 0 && (
        <>
          <SectionTitle>Offices</SectionTitle>
          {c.offices.length > 1 && (
            <p className="mb-3 text-sm text-muted">
              Start with the {o.level === "federal" ? "Washington, DC" : "Capitol"} office. If the line is busy or voicemail is full, call any local office—staff log constituent calls at every location.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {c.offices.map((off, i) => (
              <Card key={i} className="text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{off.name}</p>
                  {i === 0 && c.offices!.length > 1 && /washington|d\.?c\.?|capitol/i.test(off.name) && (
                    <Pill tone="accent">Call first</Pill>
                  )}
                </div>
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

      <SectionTitle hint={activity.length ? `${activity.length} ${activity.length === 1 ? "item" : "items"} · most recent first` : "Most recent first"}>
        Bills &amp; items involved in
      </SectionTitle>
      {activity.length ? (
        <ul className="space-y-2.5">
          {activity.map((a) => {
            const headline = a.headline || a.title;
            const showRaw = headline !== a.title;
            return (
              <li key={`${a.id}-${a.role}`}>
                <Link
                  href={`/items/${a.id}`}
                  className="block rounded-xl border border-line bg-card p-3.5 transition hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <Kicker>{LEVEL_LABEL[a.level]}</Kicker>
                    <Pill tone="accent" className="capitalize">
                      {a.role}
                      {a.vote ? `: ${a.vote}` : ""}
                    </Pill>
                    {a.last_action_at && (
                      <span className="ml-auto text-xs tabular-nums text-muted">
                        {new Date(a.last_action_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 font-medium leading-snug">{headline}</p>
                  {showRaw && <p className="mt-0.5 truncate text-xs text-muted">{a.title}</p>}
                  {a.status && <p className="mt-1 text-xs text-muted">{a.status}</p>}
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
