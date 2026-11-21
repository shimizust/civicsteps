import type { Database } from "@/lib/supabase/database.types";

type Official = Pick<Database["public"]["Tables"]["officials"]["Row"], "id" | "name" | "office" | "photo_url">;

const initials = (name: string) => name.split(" ").map((p) => p[0]).slice(0, 2).join("");

/** Overlapping photos of the user's reps involved in an item. */
export function RepAvatars({ officials }: { officials: Official[] }) {
  if (!officials.length) return null;
  const shown = officials.slice(0, 3);
  const label =
    officials.length === 1 ? `Your ${officials[0].office.toLowerCase()} ${officials[0].name} is involved` : `${officials.length} of your reps are involved`;
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted">
      <span className="flex -space-x-2">
        {shown.map((o) =>
          o.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={o.id} src={o.photo_url} alt="" title={o.name} loading="lazy" className="h-7 w-7 rounded-full bg-line object-cover ring-2 ring-card" />
          ) : (
            <span key={o.id} title={o.name} className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent ring-2 ring-card">
              {initials(o.name)}
            </span>
          ),
        )}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}
