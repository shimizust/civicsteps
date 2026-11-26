import Link from "next/link";
import { ExternalLink, Mail, PenLine, Phone } from "lucide-react";
import type { Database } from "@/lib/supabase/database.types";
import { contactsOf } from "@/lib/civic/officials";
import { Card, Pill, cx } from "@/components/ui";

type Official = Database["public"]["Tables"]["officials"]["Row"];

export function OfficialCard({
  o,
  role,
  draftHref,
  hero = false,
  compact = false,
}: {
  o: Official;
  role?: string;
  draftHref?: string;
  hero?: boolean;
  compact?: boolean;
}) {
  const c = contactsOf(o);
  const phone = c.phones?.[0] ?? c.offices?.find((x) => x.phone)?.phone;
  const email = c.emails?.[0];
  const form = c.contact_form_url;

  return (
    <Card className={cx("flex gap-3.5", compact && "!p-3.5", hero && "items-center gap-4 sm:p-6")}>
      {o.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={o.photo_url}
          alt=""
          className={cx("shrink-0 rounded-lg bg-line object-cover", hero ? "h-20 w-18 rounded-xl" : "h-16 w-14")}
          loading="lazy"
        />
      ) : (
        <div
          className={cx(
            "flex shrink-0 items-center justify-center rounded-lg bg-accent-soft font-display text-accent",
            hero ? "h-20 w-18 rounded-xl text-2xl" : "h-16 w-14 text-xl",
          )}
        >
          {o.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {hero ? (
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{o.name}</h1>
          ) : (
            <Link
              href={`/reps/${encodeURIComponent(o.id)}`}
              className="rounded font-semibold hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {o.name}
            </Link>
          )}
          {o.party && <Pill>{o.party}</Pill>}
          {role && <Pill tone="accent">{role}</Pill>}
        </div>
        <p className="mt-0.5 text-sm text-muted">{o.office}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          {phone && (
            <a
              className="inline-flex items-center gap-1.5 rounded text-accent tabular-nums hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              href={`tel:${phone.replace(/[^\d+]/g, "")}`}
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              {phone}
            </a>
          )}
          {email && (
            <a
              className="inline-flex items-center gap-1.5 rounded text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              href={`mailto:${email}`}
            >
              <Mail className="h-3.5 w-3.5" aria-hidden />
              Email
            </a>
          )}
          {!email && form && (
            <a
              className="inline-flex items-center gap-1.5 rounded text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              href={form}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Contact form
            </a>
          )}
          {draftHref && (
            <Link
              className="inline-flex items-center gap-1.5 rounded font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              href={draftHref}
            >
              <PenLine className="h-3.5 w-3.5" aria-hidden />
              Draft a message
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
