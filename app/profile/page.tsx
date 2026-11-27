import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Bookmark, Flame, Star } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { getAnswers, getFavoriteIds, getInterests, getProfile, getRegistry, getStats } from "@/lib/data";
import { factQuestion, PROFILE_PREFIX } from "@/lib/facts";
import { DEMOGRAPHIC_QUESTIONS } from "@/lib/taxonomy";
import { FactQuestion, ForgetAnswer } from "@/components/FactQuestion";
import { BadgeIcon } from "@/components/BadgeIcon";
import { POINTS } from "@/lib/gamification";
import { Button, Card, Kicker, PageTitle, Pill, SectionTitle, cx } from "@/components/ui";

const POINT_ROWS = [
  ["Read a summary", POINTS.read],
  ["Share an item", POINTS.shared],
  ["Sign a petition", POINTS.signed],
  ["Email an official", POINTS.emailed],
  ["Call an office", POINTS.called],
  ["Submit a comment", POINTS.commented],
  ["Attend or testify", POINTS.attended],
] as const;

export default async function ProfilePage() {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/profile");
  const [stats, profile, interests, answers, favoriteIds] = await Promise.all([
    getStats(supabase, user.id),
    getProfile(supabase, user.id),
    getInterests(supabase, user.id),
    getAnswers(supabase, user.id),
    getFavoriteIds(supabase, user.id),
  ]);
  const registry = await getRegistry(supabase, Object.keys(answers).filter((k) => !k.startsWith(PROFILE_PREFIX)));
  const factAnswers = Object.entries(answers).flatMap(([key, value]) => {
    const f = registry.get(key);
    return f ? [{ f, value }] : [];
  });
  const declinedProfile = DEMOGRAPHIC_QUESTIONS.filter((q) => `${PROFILE_PREFIX}${q.key}` in answers);
  const { level } = stats;
  const pct = level.next
    ? Math.max(0, Math.min(100, Math.round(((stats.points - level.current) / (level.next - level.current)) * 100)))
    : 100;

  const petInterests = interests.filter((i) => i.is_pet);
  const topicInterests = interests.filter((i) => !i.is_pet);

  return (
    <div>
      <PageTitle sub={user.email}>Your civic profile</PageTitle>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Kicker>Level {level.level}</Kicker>
            <p className="mt-0.5 font-display text-2xl font-semibold">{level.title}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl font-semibold tabular-nums text-accent">{stats.points}</p>
            <p className="text-sm text-muted">points</p>
          </div>
        </div>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="Level progress"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums text-muted">
          <span>{level.next ? `${level.next - stats.points} points to the next level` : "Top level reached"}</span>
          <span>·</span>
          <span>{stats.voiceCount} actions</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <Flame className={cx("h-4 w-4", stats.streak > 0 ? "text-urgent" : "text-muted")} aria-hidden />
            {stats.streak ? `${stats.streak}-week streak` : "No streak yet"}
          </span>
        </div>
      </Card>

      <SectionTitle hint={`${stats.badges.filter((b) => b.awarded_at).length}/${stats.badges.length}`}>Badges</SectionTitle>
      <ul className="grid gap-3 sm:grid-cols-2">
        {stats.badges.map((b) => {
          const earned = !!b.awarded_at;
          const bPct = Math.min(100, Math.round((b.progress.current / Math.max(1, b.progress.target)) * 100));
          return (
            <li key={b.slug}>
              <Card className={cx("flex h-full gap-3.5", !earned && "bg-card/70")}>
                <BadgeIcon slug={b.slug} earned={earned} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{b.name}</p>
                    {earned && (
                      <span className="text-xs font-medium text-accent tabular-nums">
                        {new Date(b.awarded_at!).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{b.description}</p>
                  {!earned && (
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between text-xs tabular-nums text-muted">
                        <span>
                          {b.progress.current} of {b.progress.target} {b.progress.unit}
                        </span>
                        <span>{bPct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${bPct}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <SectionTitle>How points work</SectionTitle>
      <Card>
        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {POINT_ROWS.map(([label, pts]) => (
            <div key={label} className="rounded-lg border border-line/70 bg-paper px-3 py-2">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-0.5 font-display text-base font-semibold tabular-nums text-accent">+{pts} pts</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">Points reward taking part — never which side you take.</p>
      </Card>

      <SectionTitle>Your interests</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-2">
            <Kicker className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-pet" aria-hidden /> Pet issues
            </Kicker>
            <Link className="text-xs font-medium text-accent hover:underline" href="/onboarding?step=4">
              Edit
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {petInterests.map((i) => (
              <Pill key={i.id} tone="pet">
                <Star className="h-3 w-3 fill-current" aria-hidden />
                {i.label}
              </Pill>
            ))}
            {!petInterests.length && (
              <p className="text-sm text-muted">
                None yet.{" "}
                <Link className="text-accent underline" href="/onboarding?step=4">
                  Add a pet issue
                </Link>
              </p>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <Kicker>Followed topics</Kicker>
            <Link className="text-xs font-medium text-accent hover:underline" href="/onboarding?step=3">
              Edit
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {topicInterests.map((i) => (
              <Pill key={i.id} tone="accent">
                {i.label}
              </Pill>
            ))}
            {!topicInterests.length && (
              <p className="text-sm text-muted">
                None yet.{" "}
                <Link className="text-accent underline" href="/onboarding?step=3">
                  Choose topics
                </Link>
              </p>
            )}
          </div>
        </Card>

        <Card className="sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Kicker className="inline-flex items-center gap-1">
              <Bookmark className="h-3.5 w-3.5 text-favorite" aria-hidden /> Favorited issues
            </Kicker>
            <Link className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline" href="/favorites">
              View favorites <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          <p className="mt-2 text-sm text-muted">
            {favoriteIds.size > 0 ? (
              <>
                You&apos;re following up on{" "}
                <strong className="font-medium tabular-nums text-ink">{favoriteIds.size}</strong>{" "}
                {favoriteIds.size === 1 ? "issue" : "issues"} for status changes and deadlines.
              </>
            ) : (
              "Favorite any bill, hearing, or comment period to keep following up on updates and deadlines."
            )}
          </p>
        </Card>
      </div>

      <SectionTitle hint={<Link className="text-accent hover:underline" href="/onboarding?step=2">Edit profile answers</Link>}>
        Your answers
      </SectionTitle>
      <Card>
        <p className="text-sm text-muted">
          Details you shared so we can tell how specific items affect you. They stay private to your account. Change or forget any of them;
          we&apos;ll ask again only if an item depends on it.
        </p>
        {factAnswers.length || declinedProfile.length ? (
          <ul className="mt-2 divide-y divide-line">
            {factAnswers.map(({ f, value }) => (
              <li key={f.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <FactQuestion q={factQuestion(f)} source="profile" current={value} />
                </div>
                <div className="pt-3">
                  <ForgetAnswer factKey={f.key} />
                </div>
              </li>
            ))}
            {declinedProfile.map((q) => (
              <li key={q.key} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="text-muted">Chose not to answer:</span> {q.ask}
                </span>
                <ForgetAnswer factKey={`${PROFILE_PREFIX}${q.key}`} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Nothing yet. Questions show up on your feed and on items when an answer would change how something affects you.
          </p>
        )}
      </Card>

      <SectionTitle>Settings</SectionTitle>
      <Card className="divide-y divide-line text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div>
            <p className="font-medium">Active ZIP code</p>
            <p className="text-muted tabular-nums">{profile?.zip ?? "Not set"}</p>
          </div>
          {profile?.onboarded_at ? (
            <p className="text-muted">Use the ZIP menu above to add or switch locations.</p>
          ) : (
            <Link className="font-medium text-accent hover:underline" href="/onboarding?step=1">Set ZIP code</Link>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div>
            <p className="font-medium">Email notifications</p>
            <p className="text-muted">
              Pet issue &amp; favorite alerts: {profile?.notify_alerts ? "on" : "off"} · Weekly digest: {profile?.notify_digest ? "on" : "off"}
            </p>
          </div>
          <Link className="font-medium text-accent hover:underline" href="/onboarding?step=5">
            Change
          </Link>
        </div>
        <div className="pt-3">
          <form action="/auth/signout" method="post">
            <Button variant="secondary" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
