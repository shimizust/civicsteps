"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

export function BrowseFilters({
  q,
  level,
  scope,
  topic,
  sort,
  topics,
}: {
  q: string;
  level: string | null;
  scope: "area" | "all";
  topic: string | null;
  sort: "recent" | "deadline";
  topics: { slug: string; name: string }[];
}) {
  const router = useRouter();

  function navigate(next: { topic?: string | null; sort?: "recent" | "deadline" }) {
    const t = next.topic !== undefined ? next.topic : topic;
    const s = next.sort !== undefined ? next.sort : sort;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (level) params.set("level", level);
    if (scope === "all") params.set("scope", "all");
    if (t) params.set("topic", t);
    if (s === "deadline") params.set("sort", "deadline");
    const qs = params.toString();
    router.push(qs ? `/browse?${qs}` : "/browse");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="browse-topic">
        Filter by topic
      </label>
      <Select
        id="browse-topic"
        value={topic ?? ""}
        onChange={(e) => navigate({ topic: e.target.value || null })}
        className="!w-auto min-w-44 py-1.5"
      >
        <option value="">All topics</option>
        {topics.map((t) => (
          <option key={t.slug} value={t.slug}>
            {t.name}
          </option>
        ))}
      </Select>

      <label className="sr-only" htmlFor="browse-sort">
        Sort items
      </label>
      <Select
        id="browse-sort"
        value={sort}
        onChange={(e) => navigate({ sort: e.target.value === "deadline" ? "deadline" : "recent" })}
        className="!w-auto min-w-40 py-1.5"
      >
        <option value="recent">Sort: Most recent</option>
        <option value="deadline">Sort: Deadline soonest</option>
      </Select>
    </div>
  );
}
