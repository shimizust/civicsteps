import type { CSSProperties } from "react";
import { Star } from "lucide-react";
import { TOPIC_ART, topicName, topicParent } from "@/lib/taxonomy";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";

const FALLBACK = { icon: "FileText", hue: 170 };

/** Colored icon tile for an item's main topic. Pet issues get a star badge. */
export function TopicTile({ topics, pet, size = "md" }: { topics: string[]; pet?: boolean; size?: "sm" | "md" | "lg" }) {
  const parent = topics[0] ? topicParent(topics[0]) : null;
  const art = (parent && TOPIC_ART[parent]) || FALLBACK;
  const dims = { sm: "h-10 w-10 rounded-lg", md: "h-14 w-14 rounded-xl", lg: "h-20 w-20 rounded-2xl" }[size];
  const icon = { sm: "h-5 w-5", md: "h-7 w-7", lg: "h-10 w-10" }[size];
  return (
    <div
      className={cx("topic-tile relative flex shrink-0 items-center justify-center", dims)}
      style={{ "--hue": art.hue } as CSSProperties}
      title={parent ? topicName(parent) : undefined}
    >
      <Icon name={art.icon} className={icon} />
      {pet && (
        <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-pet text-white ring-2 ring-card dark:text-paper" title="Your pet issue">
          <Star className="h-3.5 w-3.5 fill-current" aria-label="Pet issue" />
        </span>
      )}
    </div>
  );
}
