import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { contactsOf } from "@/lib/civic/officials";
import { OfficialCard } from "@/components/OfficialCard";
import { Card, Empty, PageTitle, Pill, SectionTitle } from "@/components/ui";

export default async function RepPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/reps");

  const [{ data: o }, { data: activity }] = await Promise.all([
    supabase.from("officials").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("item_officials")
      .select("role, vote, items!inner(id, title, status, last_action_at, level)")
      .eq("official_id", id)
      .order("last_action_at", { referencedTable: "items", ascending: false })
      .limit(25),
  ]);
  if (!o) notFound();
  const c = contactsOf(o);

  return (
    <div>
      <Link href="/reps" className="text-sm text-muted hover:text-accent">← All representatives</Link>
      <div className="mt-4"><PageTitle>{o.name}</PageTitle></div>
      <OfficialCard o={o} />

      {c.offices && c.offices.length > 0 && (
        <>
          <SectionTitle>Offices</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {c.offices.map((off, i) => (
              <Card key={i} className="text-sm">
                <p className="font-medium">{off.name}</p>
                {off.address && <p className="mt-1 text-muted">{off.address}</p>}
                {off.phone && <a className="mt-1 block text-accent" href={`tel:${off.phone.replace(/[^\d+]/g, "")}`}>{off.phone}</a>}
              </Card>
            ))}
          </div>
        </>
      )}
      {c.website && <p className="mt-4 text-sm"><a className="text-accent underline" href={c.website} target="_blank" rel="noreferrer">Official website ↗</a></p>}

      <SectionTitle hint="Most recent first">Recent activity</SectionTitle>
      {activity?.length ? (
        <ul className="space-y-2">
          {activity.map((a) => (
            <li key={`${a.items.id}-${a.role}`}>
              <Link href={`/items/${a.items.id}`} className="block rounded-lg border border-line bg-card p-3 hover:border-accent">
                <div className="flex flex-wrap gap-1.5"><Pill tone="accent">{a.role}{a.vote ? `: ${a.vote}` : ""}</Pill></div>
                <p className="mt-1 text-sm font-medium">{a.items.title}</p>
                {a.items.status && <p className="text-xs text-muted">{a.items.status}</p>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No tracked activity yet. Sponsorships appear here as bills are ingested.</Empty>
      )}
    </div>
  );
}
