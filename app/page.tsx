import { redirect } from "next/navigation";
import { ArrowUp, Clock, Code2, Scale, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopicTile } from "@/components/TopicTile";
import { Card, Kicker, LinkButton, Pill } from "@/components/ui";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/feed");

  const steps = [
    ["Tell us where you live and what you care about", "Your ZIP code finds your districts. Add pet issues like climbing access or transit, as specific as you like."],
    ["See what's being decided", "Bills, city council agendas and federal comment periods, filtered to what affects you and sorted by deadline."],
    ["Speak up in two minutes", "Get a draft email, call script or public comment in your own words, plus your reps' contact info."],
    ["Keep it up", "Earn badges for showing up, and get a heads-up before deadlines on the issues you care about."],
  ];

  return (
    <div className="py-6 sm:py-10">
      <div className="lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:gap-10">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-accent">City · State · Federal</p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Don&apos;t miss the decisions that shape your life.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            CivicSteps watches city hall, your statehouse and Washington for the things you care about, tells you when it&apos;s your turn
            to weigh in, and helps you say it well.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <LinkButton href="/login" className="px-6 py-3 text-base">
              Get started — it&apos;s free
            </LinkButton>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
              ZIP code only — never sold or sent to AI
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Scale className="h-4 w-4 text-accent" aria-hidden />
              Strictly nonpartisan
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Code2 className="h-4 w-4 text-accent" aria-hidden />
              Open source
            </li>
          </ul>
        </div>

        {/* Realistic preview of a CivicSteps feed card */}
        <div className="mt-10 lg:mt-0" aria-hidden="true">
          <div className="rounded-2xl border border-line bg-paper p-3 shadow-sm">
            <Card className="flex gap-3.5 sm:p-5">
              <TopicTile topics={["transportation/transit"]} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Kicker>City · Council agenda</Kicker>
                  <Pill tone="urgent" className="tabular-nums">
                    <Clock className="h-3 w-3" />
                    On the agenda in 3 days
                  </Pill>
                </div>
                <p className="mt-2 font-display text-lg font-semibold leading-snug">
                  Bus Priority Lanes &amp; Protected Bike Corridor on Broadway
                </p>
                <p className="mt-1.5 text-sm text-muted">
                  Dedicates curb lanes to rush-hour transit and adds signal priority at 12 intersections near downtown.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2 py-1 text-xs">
                    <span className="font-medium">Getting around</span>
                    <span className="inline-flex gap-0.5">
                      <span className="h-1.5 w-3 rounded-full bg-benefit" />
                      <span className="h-1.5 w-3 rounded-full bg-benefit" />
                      <span className="h-1.5 w-3 rounded-full bg-benefit" />
                    </span>
                    <ArrowUp className="h-3.5 w-3.5 text-benefit" />
                  </span>
                  <span className="ml-auto text-xs font-medium text-benefit">Affects you: High</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <ol className="mt-14 grid gap-4 sm:grid-cols-2">
        {steps.map(([title, body], i) => (
          <li key={title}>
            <Card className="flex h-full gap-4">
              <span className="font-display text-3xl font-semibold tabular-nums text-accent">{i + 1}</span>
              <div>
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
