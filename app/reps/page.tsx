import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getMyOfficials, getProfile } from "@/lib/data";
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

  return (
    <div>
      <PageTitle sub={profile?.address ? `For ${profile.address}` : undefined}>Your representatives</PageTitle>
      {!profile?.address && (
        <Empty>
          <Link className="text-accent underline" href="/onboarding?step=1">Add your address</Link> to see who represents you.
        </Empty>
      )}
      {GROUPS.map((g) => {
        const list = officials.filter((o) => (g.levels as readonly string[]).includes(o.level));
        if (!profile?.address) return null;
        return (
          <section key={g.title}>
            <SectionTitle>{g.title}</SectionTitle>
            {list.length ? (
              <ul className="space-y-3">{list.map((o) => <li key={o.id}><OfficialCard o={o} /></li>)}</ul>
            ) : (
              <Empty>
                {g.levels.includes("state" as never)
                  ? "State legislators appear once the server has an Open States API key."
                  : g.levels.includes("city" as never)
                    ? "Your city's council data isn't connected yet. Cities on Legistar can be added in ingest/legistar.config.ts."
                    : "No federal representatives found for this address."}
              </Empty>
            )}
          </section>
        );
      })}
    </div>
  );
}
