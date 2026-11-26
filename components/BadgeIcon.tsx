import type { CSSProperties } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";

const BADGE_ART: Record<string, { icon: string; hue: number }> = {
  "first-contact": { icon: "Megaphone", hue: 165 },
  "well-informed": { icon: "BookOpen", hue: 215 },
  "comment-champion": { icon: "FilePenLine", hue: 145 },
  "all-three-levels": { icon: "Landmark", hue: 35 },
  "pet-issue-guardian": { icon: "Shield", hue: 285 },
  "steady-voice": { icon: "Flame", hue: 25 },
};

/** Crisp vector medallion for civic achievement badges, replacing platform-dependent emojis. */
export function BadgeIcon({ slug, earned }: { slug: string; earned: boolean }) {
  const art = BADGE_ART[slug] ?? { icon: "Award", hue: 165 };
  return (
    <div
      className={cx(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
        earned ? "topic-tile" : "border border-line bg-paper text-muted",
      )}
      style={earned ? ({ "--hue": art.hue } as CSSProperties) : undefined}
      aria-hidden
    >
      <Icon name={art.icon} className="h-5 w-5" />
    </div>
  );
}
