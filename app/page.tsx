import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LinkButton } from "@/components/ui";

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
    <div className="py-6 sm:py-12">
      <p className="text-sm font-medium uppercase tracking-widest text-accent">City · State · Federal</p>
      <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
        Don&apos;t miss the decisions that shape your life.
      </h1>
      <p className="mt-5 max-w-xl text-lg text-muted">
        CivicSteps watches city hall, your statehouse and Washington for the things you care about, tells you when it&apos;s your turn
        to weigh in, and helps you say it well.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <LinkButton href="/login" className="px-6 py-3 text-base">Get started — it&apos;s free</LinkButton>
      </div>
      <ol className="mt-14 grid gap-6 sm:grid-cols-2">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-4">
            <span className="font-display text-3xl text-accent">{i + 1}</span>
            <div>
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
