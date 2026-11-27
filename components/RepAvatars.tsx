import type { Database } from "@/lib/supabase/database.types";
import { OfficialPortrait } from "@/components/OfficialPortrait";

type Official = Pick<Database["public"]["Tables"]["officials"]["Row"], "id" | "name" | "office" | "photo_url">;

/** Overlapping photos of the user's reps involved in an item. */
export function RepAvatars({ officials }: { officials: Official[] }) {
  if (!officials.length) return null;
  const shown = officials.slice(0, 3);
  const label =
    officials.length === 1 ? `Your ${officials[0].office.toLowerCase()} ${officials[0].name} is involved` : `${officials.length} of your reps are involved`;
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted">
      <span className="flex -space-x-2">
        {shown.map((o) => (
          <OfficialPortrait key={o.id} name={o.name} src={o.photo_url} title={o.name}
            className="h-7 w-7 rounded-full ring-2 ring-card" fallbackClassName="text-[10px] font-semibold" />
        ))}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}
