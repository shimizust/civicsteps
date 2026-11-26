import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const variants = {
  primary: "bg-accent text-white hover:brightness-110 dark:text-paper",
  secondary: "border border-line bg-card text-ink hover:border-accent",
  ghost: "text-accent hover:bg-accent-soft",
};
type Variant = keyof typeof variants;

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(buttonBase, variants[variant], className)} {...p} />;
}

export function LinkButton({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(buttonBase, variants[variant], className)} {...p} />;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-line bg-card p-4 sm:p-5", className)} {...p} />;
}

export const inputClass =
  "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-muted/80 transition focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cx(inputClass, className)} {...p} />;
}

export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputClass, className)} {...p} />;
}

export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cx(inputClass, className)} {...p} />;
}

const pillTones = {
  neutral: "bg-paper text-muted border border-line",
  accent: "bg-accent-soft text-accent",
  urgent: "bg-urgent-soft text-urgent",
  cost: "bg-cost-soft text-cost",
  benefit: "bg-benefit-soft text-benefit",
  pet: "bg-pet-soft text-pet",
};
export function Pill({ tone = "neutral", children, className }: { tone?: keyof typeof pillTones; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", pillTones[tone], className)}>{children}</span>;
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("text-[11px] font-semibold uppercase tracking-wider text-muted", className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-line/60", className)} aria-hidden />;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{children}</h1>
      {sub && <p className="mt-2 text-muted">{sub}</p>}
    </header>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between gap-4">
      <h2 className="font-display text-xl font-semibold">{children}</h2>
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}

export const LEVEL_LABEL = { city: "City", county: "County", state: "State", federal: "Federal" } as const;

export function deadlineLabel(daysLeft: number | null, kind: "comment" | "event" = "comment") {
  if (daysLeft === null) return null;
  const verb = kind === "comment" ? "Comments close" : "On the agenda";
  if (daysLeft <= 0) return `${verb} today`;
  if (daysLeft === 1) return `${verb} tomorrow`;
  return `${verb} in ${daysLeft} days`;
}

export { cx };
