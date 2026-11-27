import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getAreaProgress, getMyOfficials, getOfficialActivity, getProfile } from "@/lib/data";
import { areasFor, citySupportFor, formatList, summarizeCoverage } from "@/lib/coverageStatus";
import { placeName } from "@/lib/place";
import { LocalIndexProgress } from "@/components/LocalIndexProgress";
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
  const [activityByOfficial, coverage] = await Promise.all([
    getOfficialActivity(
      supabase,
      officials.map((o) => o.id),
    ),
    profile?.zip ? getAreaProgress(supabase, areasFor(profile.state, profile.jurisdiction_ids)) : Promise.resolve(null),
  ]);
  const now = Date.now();
  const place = profile ? placeName(profile.jurisdiction_ids, profile.state) : null;
  const citySupport = profile ? citySupportFor(profile.jurisdiction_ids) : null;
  const coverageSummary = summarizeCoverage(coverage, now);

  return (
    <div>
      <PageTitle sub={profile?.zip ? `For ZIP ${profile.zip}${place ? ` (${place})` : ""}` : undefined}>Your representatives</PageTitle>
      {profile?.zip && (
        <LocalIndexProgress
          zip={profile.zip}
          place={place}
          citySupport={citySupport ?? undefined}
          areas={coverage}
          now={now}
        />
      )}
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
                    ? citySupport?.supported && coverageSummary.cityPending
                      ? coverageSummary.cityInProgress
                        ? `${citySupport.name} city council officials and agendas are currently being indexed. Refresh in a moment to see them.`
                        : `${citySupport.name} city council officials and agendas are scheduled for the next indexing run.`
                      : citySupport && !citySupport.supported && citySupport.place
                        ? `City council officials and agendas aren't connected for ${citySupport.place} yet (currently ${formatList(citySupport.supportedCities)}).`
                        : "City council officials and agendas aren't connected for this ZIP code yet."
                    : "No federal representatives found for this ZIP code."}
              </Empty>
            )}
          </section>
        );
      })}
    </div>
  );
}
