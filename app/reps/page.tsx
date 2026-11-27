import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getMyOfficials, getOfficialActivity, getProfile } from "@/lib/data";
import { placeName } from "@/lib/place";
import { OfficialCard } from "@/components/OfficialCard";
import { Empty, PageTitle, SectionTitle } from "@/components/ui";

const GROUPS = [
  { title: "City & county", levels: ["city", "county"] },
  { title: "State", levels: ["state"] },
  { title: "Federal", levels: ["federal"] },
] as const;

export default async function RepsPage() {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/reps");
  const [officials, profile] = await Promise.all([getMyOfficials(supabase, user.id), getProfile(supabase, user.id)]);
  const activityByOfficial = await getOfficialActivity(
    supabase,
    officials.map((o) => o.id),
  );
  const place = profile ? placeName(profile.jurisdiction_ids, profile.state) : null;

  return (
    <div>
      <PageTitle sub={profile?.zip ? `For ZIP ${profile.zip}${place ? ` (${place})` : ""}` : undefined}>Your representatives</PageTitle>
      {!profile?.zip && (
        <Empty>
          <Link className="text-accent underline" href="/onboarding?step=1">Add your ZIP code</Link> to see who represents you.
        </Empty>
      )}
      {GROUPS.map((g) => {
        const list = officials.filter((o) => (g.levels as readonly string[]).includes(o.level));
        if (!profile?.zip) return null;
        return (
          <section key={g.title}>
            <SectionTitle hint={list.length ? `${list.length} ${list.length === 1 ? "official" : "officials"}` : undefined}>{g.title}</SectionTitle>
            {list.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {list.map((o) => (
                  <li key={o.id}>
                    <OfficialCard o={o} activity={activityByOfficial[o.id]} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>
                {g.levels.includes("state" as never)
                  ? "State legislator data isn't available for your area yet."
                  : g.levels.includes("city" as never)
                    ? "City council officials and agendas aren't connected for your city yet."
                    : "No federal representatives found for this ZIP code."}
              </Empty>
            )}
          </section>
        );
      })}
    </div>
  );
}
