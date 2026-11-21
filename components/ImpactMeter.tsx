import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { FACETS } from "@/lib/taxonomy";
import type { Direction, ImpactLevel, PersonalFacet, PersonalImpact } from "@/lib/impact";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";

const DIR = {
  benefit: { Icon: ArrowUp, label: "Likely helps", tone: "text-benefit", fill: "bg-benefit" },
  cost: { Icon: ArrowDown, label: "Likely costs", tone: "text-urgent", fill: "bg-urgent" },
  mixed: { Icon: ArrowUpDown, label: "Mixed or unclear", tone: "text-muted", fill: "bg-accent" },
} satisfies Record<Direction, unknown>;

function Dots({ n, fill, className }: { n: number; fill: string; className?: string }) {
  return (
    <span className={cx("inline-flex gap-0.5", className)} aria-hidden>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cx("h-1.5 w-3 rounded-full", i <= n ? fill : "bg-line")} />
      ))}
    </span>
  );
}

const SIZE_WORD = ["Barely", "A little", "Noticeably", "A lot"];

function describe(f: PersonalFacet, showDir: boolean) {
  const parts = [`${f.label}: ${SIZE_WORD[f.magnitude].toLowerCase()} for you`];
  if (showDir && f.direction !== "mixed") parts.push(DIR[f.direction].label.toLowerCase());
  if (f.note) parts.push(f.note);
  if (f.because.length) parts.push(`because ${f.because.join(", ")}`);
  else if (f.forOthers && f.who.length) parts.push(`mostly affects ${f.who.join(", ")}`);
  return parts.join(" · ");
}

/** Compact chip for feed cards: facet icon, 3-dot meter, direction arrow. */
export function ImpactChip({ f, showDirection }: { f: PersonalFacet; showDirection: boolean }) {
  const d = DIR[showDirection ? f.direction : "mixed"];
  const text = describe(f, showDirection);
  return (
    <span
      className={cx("inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2 py-1 text-xs", f.forOthers && "opacity-60")}
      title={text}
    >
      <Icon name={FACETS[f.facet].icon} className="h-3.5 w-3.5 text-ink" />
      <span className="font-medium">{f.label}</span>
      <Dots n={f.magnitude} fill={d.fill} />
      {showDirection && f.direction !== "mixed" && <d.Icon className={cx("h-3.5 w-3.5", d.tone)} aria-hidden />}
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** Full row for the detail page scorecard. */
export function ImpactRow({ f, showDirection }: { f: PersonalFacet; showDirection: boolean }) {
  const d = DIR[showDirection ? f.direction : "mixed"];
  return (
    <li className={cx("flex gap-3 py-3", f.forOthers && "opacity-70")}>
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon name={FACETS[f.facet].icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold">{f.label}</span>
          <Dots n={f.magnitude} fill={d.fill} className="[&>span]:h-2 [&>span]:w-5" />
          <span className="text-xs text-muted">{SIZE_WORD[f.magnitude]} for you</span>
          {showDirection && (
            <span className={cx("inline-flex items-center gap-1 text-xs font-medium", d.tone)}>
              <d.Icon className="h-3.5 w-3.5" aria-hidden />
              {d.label}
              {f.who.length > 0 && <span className="font-normal text-muted">for {f.who.join(", ")}</span>}
            </span>
          )}
        </div>
        {f.note && <p className="mt-1 text-sm">{f.note}</p>}
        {f.because.length > 0 ? (
          <p className="mt-1 text-xs text-muted">Applies to you because {f.because.join(", ")}.</p>
        ) : f.forOthers && f.who.length > 0 ? (
          <p className="mt-1 text-xs text-muted">Mostly affects {f.who.join(", ")}.</p>
        ) : null}
      </div>
    </li>
  );
}

const LEVEL = {
  high: { label: "High", tone: "text-urgent", ring: "var(--color-urgent)" },
  medium: { label: "Medium", tone: "text-accent", ring: "var(--color-accent)" },
  low: { label: "Low", tone: "text-muted", ring: "var(--color-muted)" },
} satisfies Record<ImpactLevel, unknown>;

/** "Affects you: High" with a small ring gauge (0-100). */
export function ImpactBadge({ impact, size = "sm" }: { impact: PersonalImpact; size?: "sm" | "lg" }) {
  if (!impact.level) return null;
  const l = LEVEL[impact.level];
  const px = size === "lg" ? 44 : 22;
  const r = px / 2 - (size === "lg" ? 4 : 2.5);
  const circ = 2 * Math.PI * r;
  const pct = Math.max(8, impact.overall) / 100;
  return (
    <span className={cx("inline-flex items-center gap-2", size === "lg" ? "text-base" : "text-xs")}>
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden className="-rotate-90">
        <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={size === "lg" ? 5 : 3} />
        <circle
          cx={px / 2} cy={px / 2} r={r} fill="none" stroke={l.ring} strokeWidth={size === "lg" ? 5 : 3}
          strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round"
        />
      </svg>
      <span>
        <span className="text-muted">Affects you: </span>
        <strong className={l.tone}>{l.label}</strong>
      </span>
    </span>
  );
}
