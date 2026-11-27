import Link from "next/link";
import { ChevronDown, ExternalLink, Mail, PenLine, Phone } from "lucide-react";
import type { Database } from "@/lib/supabase/database.types";
import { contactsOf, phoneNumbersOf } from "@/lib/civic/officials";
import { Card, Pill, cx } from "@/components/ui";

type Official = Database["public"]["Tables"]["officials"]["Row"];

function shortOfficeLabel(label: string) {
  if (/washington.*d\.?c/i.test(label)) return "DC office";
  if (/capitol/i.test(label)) return "Capitol office";
  return label;
}

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
  const phones = phoneNumbersOf(c);
  const primaryPhone = phones[0];
  const localPhones = phones.slice(1);
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
          {primaryPhone && (
            <a
              className="inline-flex items-center gap-1.5 rounded text-accent tabular-nums hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              href={`tel:${primaryPhone.phone.replace(/[^\d+]/g, "")}`}
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              <span>{primaryPhone.phone}</span>
              {localPhones.length > 0 && (
                <span className="text-xs font-normal text-muted">({shortOfficeLabel(primaryPhone.label)})</span>
              )}
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

        {!hero && localPhones.length > 0 && (
          <details className="group mt-2 text-xs">
            <summary className=" inline-flex cursor-pointer list-none items-center gap-1 rounded font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
              <span>
                {localPhones.length === 1 ? "1 local office number" : `${localPhones.length} local office numbers`}
              </span>
            </summary>
            <div className="mt-2 space-y-2 rounded-lg border border-line bg-paper p-2.5 text-xs">
              <p className="leading-relaxed text-muted">
                Call the {shortOfficeLabel(primaryPhone.label)} first. If the line is busy or voicemail is full, call any local office—staff log constituent calls at every location.
              </p>
              <ul className="space-y-1.5">
                {localPhones.map((lp, i) => (
                  <li key={`${lp.phone}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="font-medium text-ink">{lp.label}</span>
                    <a
                      className="inline-flex items-center gap-1 rounded text-accent tabular-nums hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      href={`tel:${lp.phone.replace(/[^\d+]/g, "")}`}
                    >
                      <Phone className="h-3 w-3" aria-hidden />
                      {lp.phone}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
      </div>
    </Card>
  );
}
