import Link from "next/link";
import type { Database } from "@/lib/supabase/database.types";
import { contactsOf } from "@/lib/civic/officials";
import { Card, Pill } from "@/components/ui";

type Official = Database["public"]["Tables"]["officials"]["Row"];

export function OfficialCard({ o, role, draftHref }: { o: Official; role?: string; draftHref?: string }) {
  const c = contactsOf(o);
  const phone = c.phones?.[0] ?? c.offices?.find((x) => x.phone)?.phone;
  const email = c.emails?.[0];
  const form = c.contact_form_url;
  return (
    <Card className="flex gap-4">
      {o.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={o.photo_url} alt="" className="h-16 w-14 shrink-0 rounded-lg bg-line object-cover" loading="lazy" />
      ) : (
        <div className="flex h-16 w-14 shrink-0 items-center justify-center rounded-lg bg-accent-soft font-display text-xl text-accent">
          {o.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/reps/${encodeURIComponent(o.id)}`} className="font-semibold hover:text-accent">{o.name}</Link>
          {o.party && <span className="text-xs text-muted">{o.party}</span>}
          {role && <Pill tone="accent">{role}</Pill>}
        </div>
        <p className="text-sm text-muted">{o.office}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {phone && <a className="text-accent hover:underline" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>📞 {phone}</a>}
          {email && <a className="text-accent hover:underline" href={`mailto:${email}`}>✉️ Email</a>}
          {!email && form && <a className="text-accent hover:underline" href={form} target="_blank" rel="noreferrer">✉️ Contact form</a>}
          {draftHref && <Link className="font-medium text-accent hover:underline" href={draftHref}>✍️ Draft a message</Link>}
        </div>
      </div>
    </Card>
  );
}
