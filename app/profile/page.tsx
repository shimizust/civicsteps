import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getAnswers, getInterests, getProfile, getRegistry, getStats } from "@/lib/data";
import { factQuestion, PROFILE_PREFIX } from "@/lib/facts";
import { DEMOGRAPHIC_QUESTIONS } from "@/lib/taxonomy";
import { FactQuestion, ForgetAnswer } from "@/components/FactQuestion";
import { POINTS } from "@/lib/gamification";
import { Button, Card, PageTitle, Pill, SectionTitle, cx } from "@/components/ui";

export default async function ProfilePage() {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/profile");
  const [stats, profile, interests, answers] = await Promise.all([
    getStats(supabase, user.id),
    getProfile(supabase, user.id),
    getInterests(supabase, user.id),
    getAnswers(supabase, user.id),
  ]);
  const registry = await getRegistry(supabase, Object.keys(answers).filter((k) => !k.startsWith(PROFILE_PREFIX)));
  const factAnswers = Object.entries(answers).flatMap(([key, value]) => {
    const f = registry.get(key);
    return f ? [{ f, value }] : [];
  });
  const declinedProfile = DEMOGRAPHIC_QUESTIONS.filter((q) => `${PROFILE_PREFIX}${q.key}` in answers);
  const { level } = stats;
  const pct = level.next ? Math.min(100, Math.round((stats.points / level.next) * 100)) : 100;

  return (
    <div>
      <PageTitle sub={user.email}>Your civic profile</PageTitle>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Level {level.level}</p>
            <p className="font-display text-2xl font-semibold">{level.title}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl font-semibold text-accent">{stats.points}</p>
            <p className="text-sm text-muted">points</p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted">
          {level.next ? `${level.next - stats.points} points to the next level` : "Top level reached"} · {stats.voiceCount} actions ·{" "}
          {stats.streak ? `🔥 ${stats.streak}-week streak` : "no streak yet"}
        </p>
      </Card>

      <SectionTitle hint={`${stats.badges.filter((b) => b.awarded_at).length}/${stats.badges.length}`}>Badges</SectionTitle>
      <ul className="grid gap-3 sm:grid-cols-2">
        {stats.badges.map((b) => (
          <li key={b.slug}>
            <Card className={cx("flex gap-3", !b.awarded_at && "opacity-50 grayscale")}>
              <span className="text-3xl" aria-hidden>{b.icon}</span>
              <div>
                <p className="font-medium">{b.name}</p>
                <p className="text-sm text-muted">{b.description}</p>
                {b.awarded_at && <p className="mt-1 text-xs text-accent">Earned {new Date(b.awarded_at).toLocaleDateString()}</p>}
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <SectionTitle>How points work</SectionTitle>
      <Card className="text-sm text-muted">
        Read a summary +{POINTS.read} · Share +{POINTS.shared} · Sign +{POINTS.signed} · Email +{POINTS.emailed} · Call +{POINTS.called} · Public comment +{POINTS.commented} · Attend or testify +{POINTS.attended}.
        Points reward taking part — never which side you take.
      </Card>

      <SectionTitle hint={<Link className="text-accent" href="/onboarding?step=3">Edit</Link>}>Your interests</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {interests.map((i) => <Pill key={i.id} tone={i.is_pet ? "pet" : "accent"}>{i.is_pet ? "★ " : ""}{i.label}</Pill>)}
        {!interests.length && <p className="text-sm text-muted">None yet.</p>}
      </div>

      <SectionTitle hint={<Link className="text-accent" href="/onboarding?step=2">Edit profile answers</Link>}>Your answers</SectionTitle>
      <Card>
        <p className="text-sm text-muted">
          Details you shared so we can tell how specific items affect you. They stay private to your account. Change or forget any of them; we&apos;ll ask again only if an item depends on it.
        </p>
        {factAnswers.length || declinedProfile.length ? (
          <ul className="mt-2 divide-y divide-line">
            {factAnswers.map(({ f, value }) => (
              <li key={f.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <FactQuestion q={factQuestion(f)} source="profile" current={value} />
                </div>
                <div className="pt-3"><ForgetAnswer factKey={f.key} /></div>
              </li>
            ))}
            {declinedProfile.map((q) => (
              <li key={q.key} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span><span className="text-muted">Chose not to answer:</span> {q.ask}</span>
                <ForgetAnswer factKey={`${PROFILE_PREFIX}${q.key}`} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Nothing yet. Questions show up on your feed and on items when an answer would change how something affects you.</p>
        )}
      </Card>

      <SectionTitle>Settings</SectionTitle>
      <Card className="space-y-2 text-sm">
        <p>ZIP code: {profile?.zip ?? "not set"} <Link className="text-accent" href="/onboarding?step=1">Change</Link></p>
        <p>Pet issue alerts: {profile?.notify_alerts ? "on" : "off"} · Weekly digest: {profile?.notify_digest ? "on" : "off"} <Link className="text-accent" href="/onboarding?step=5">Change</Link></p>
        <form action="/auth/signout" method="post" className="pt-2"><Button variant="secondary" type="submit">Sign out</Button></form>
      </Card>
    </div>
  );
}
