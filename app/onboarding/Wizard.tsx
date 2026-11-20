"use client";
import { useState, useTransition } from "react";
import { TOPICS, topicName, type Demographics } from "@/lib/taxonomy";
import { Button, Card, Pill, cx } from "@/components/ui";
import {
  addPetIssue,
  finishOnboarding,
  removeInterest,
  saveAddress,
  saveDemographics,
  saveTopics,
  updatePetKeywords,
  type AddressResult,
  type PetIssue,
} from "./actions";

type Props = {
  initialStep: number;
  returning: boolean;
  address: string;
  demographics: Demographics;
  topics: string[];
  pets: PetIssue[];
  prefs: { alerts: boolean; digest: boolean };
  aiEnabled: boolean;
};

const STEPS = ["Address", "About you", "Topics", "Pet issues", "Alerts"];

export function Wizard(p: Props) {
  const [step, setStep] = useState(p.initialStep);
  const [pending, start] = useTransition();
  const next = () => setStep((s) => Math.min(s + 1, 5));
  const back = () => setStep((s) => Math.max(s - 1, 1));

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-8 flex gap-1.5" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <button
              type="button"
              onClick={() => (p.returning || i + 1 < step ? setStep(i + 1) : undefined)}
              className={cx("h-1.5 w-full rounded-full", i + 1 <= step ? "bg-accent" : "bg-line")}
              aria-label={`Step ${i + 1}: ${label}`}
              aria-current={i + 1 === step ? "step" : undefined}
            />
            <span className={cx("mt-1.5 hidden text-xs sm:block", i + 1 === step ? "text-ink" : "text-muted")}>{label}</span>
          </li>
        ))}
      </ol>

      {step === 1 && <AddressStep initial={p.address} onDone={next} />}
      {step === 2 && <AboutStep initial={p.demographics} onBack={back} onDone={(d) => start(async () => { await saveDemographics(d); next(); })} pending={pending} />}
      {step === 3 && <TopicsStep initial={p.topics} onBack={back} onDone={(t) => start(async () => { await saveTopics(t); next(); })} pending={pending} />}
      {step === 4 && <PetsStep initial={p.pets} aiEnabled={p.aiEnabled} onBack={back} onDone={next} />}
      {step === 5 && <AlertsStep initial={p.prefs} onBack={back} onDone={(prefs) => start(() => finishOnboarding(prefs))} pending={pending} />}
    </div>
  );
}

function StepHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="mb-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">{sub}</p>
    </header>
  );
}

function Nav({ onBack, next, pending, disabled }: { onBack?: () => void; next: React.ReactNode; pending?: boolean; disabled?: boolean }) {
  return (
    <div className="mt-8 flex items-center justify-between">
      {onBack ? <Button type="button" variant="ghost" onClick={onBack}>Back</Button> : <span />}
      <Button type="submit" disabled={pending || disabled}>{pending ? "Saving…" : next}</Button>
    </div>
  );
}

// ---------------------------------------------------------------- 1. address

function AddressStep({ initial, onDone }: { initial: string; onDone: () => void }) {
  const [address, setAddress] = useState(initial);
  const [result, setResult] = useState<AddressResult | null>(null);
  const [submitted, setSubmitted] = useState(initial);
  const [pending, start] = useTransition();
  // Returning users with a saved address, or a fresh successful lookup of what's in the box, can continue.
  const confirmed = (result?.ok && address === submitted) || (!result && !!initial && address === initial);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmed) return onDone();
        start(async () => {
          setSubmitted(address);
          setResult(await saveAddress(address));
        });
      }}
    >
      <StepHeader
        title="Where do you live?"
        sub="Your address tells us your city, county and legislative districts, so we can find your representatives. It's never shared or sent to an AI."
      />
      <label htmlFor="address" className="text-sm font-medium">Home address</label>
      <input
        id="address"
        value={address}
        onChange={(e) => { setAddress(e.target.value); setResult(null); }}
        autoComplete="street-address"
        placeholder="123 Main St, Boulder, CO 80302"
        className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2"
      />
      {result && !result.ok && <p className="mt-2 text-sm text-urgent">{result.error}</p>}
      {result?.ok && (
        <Card className="mt-4">
          <p className="text-sm text-muted">Found</p>
          <p className="font-medium">{result.matchedAddress}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {result.summary.map((s) => <Pill key={s}>{s}</Pill>)}
          </ul>
          <p className="mt-3 text-sm text-muted">
            {result.officials} representatives linked.
            {result.stateLookup === "skipped" && " State legislators need an Open States API key on the server; we'll add them once it's set."}
            {result.stateLookup === "failed" && " We couldn't look up your state legislators right now; we'll retry later."}
          </p>
        </Card>
      )}
      <Nav next={confirmed ? "Continue" : "Look up address"} pending={pending} disabled={!address.trim()} />
    </form>
  );
}

// ---------------------------------------------------------------- 2. about you

type Q = { key: keyof Demographics; label: string } & ({ kind: "choice"; options: [string, string][] } | { kind: "bool" });
const QUESTIONS: Q[] = [
  { key: "housing", label: "Do you rent or own your home?", kind: "choice", options: [["rent", "Rent"], ["own", "Own"], ["other", "Other"]] },
  { key: "income", label: "Household income", kind: "choice", options: [["low", "Lower"], ["middle", "Middle"], ["high", "Higher"]] },
  { key: "age", label: "Age", kind: "choice", options: [["18-24", "18–24"], ["25-44", "25–44"], ["45-64", "45–64"], ["65+", "65+"]] },
  { key: "area", label: "Where you live", kind: "choice", options: [["urban", "Urban"], ["suburban", "Suburban"], ["rural", "Rural"]] },
  { key: "commute", label: "How you mostly get around", kind: "choice", options: [["transit", "Transit"], ["drive", "Drive"], ["bike-walk", "Bike / walk"], ["remote", "Work from home"]] },
  { key: "coverage", label: "Health coverage", kind: "choice", options: [["employer", "Employer"], ["marketplace", "Marketplace"], ["medicare", "Medicare"], ["medicaid", "Medicaid"], ["uninsured", "Uninsured"]] },
  { key: "work", label: "Work", kind: "choice", options: [["hourly", "Hourly"], ["small-business", "Small business owner"], ["healthcare", "Healthcare"], ["teacher", "Education"], ["tech", "Tech"], ["farm", "Farming / ranching"], ["union", "Union member"], ["other", "Other"]] },
  { key: "student", label: "Student", kind: "bool" },
  { key: "parent", label: "Parent or guardian", kind: "bool" },
  { key: "veteran", label: "Veteran", kind: "bool" },
  { key: "disability", label: "Living with a disability", kind: "bool" },
  { key: "immigrant", label: "Immigrant", kind: "bool" },
  { key: "outdoors", label: "Spend a lot of time outdoors (hiking, climbing, fishing…)", kind: "bool" },
];

function AboutStep({ initial, onBack, onDone, pending }: { initial: Demographics; onBack: () => void; onDone: (d: Demographics) => void; pending: boolean }) {
  const [d, setD] = useState<Demographics>(initial);
  const set = (k: keyof Demographics, v: unknown) => setD((prev) => ({ ...prev, [k]: prev[k] === v ? undefined : v }));
  const choices = QUESTIONS.filter((q) => q.kind === "choice");
  const bools = QUESTIONS.filter((q) => q.kind === "bool");

  return (
    <form onSubmit={(e) => { e.preventDefault(); onDone(d); }}>
      <StepHeader
        title="A little about you"
        sub="Optional. Answers are broad ranges, used only to flag issues that affect people like you (a renter protection, a Medicare change). Skip anything you like."
      />
      <div className="space-y-5">
        {choices.map((q) => q.kind === "choice" && (
          <fieldset key={q.key}>
            <legend className="mb-2 text-sm font-medium">{q.label}</legend>
            <div className="flex flex-wrap gap-2">
              {q.options.map(([v, label]) => (
                <Chip key={v} on={d[q.key] === v} onClick={() => set(q.key, v)}>{label}</Chip>
              ))}
            </div>
          </fieldset>
        ))}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Any of these apply?</legend>
          <div className="flex flex-wrap gap-2">
            {bools.map((q) => <Chip key={q.key} on={d[q.key] === true} onClick={() => set(q.key, true)}>{q.label}</Chip>)}
          </div>
        </fieldset>
      </div>
      <Nav onBack={onBack} next="Continue" pending={pending} />
    </form>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault(); // don't toggle a surrounding <details>
        onClick();
      }}
      className={cx(
        "rounded-full border px-3 py-1.5 text-sm transition",
        on ? "border-accent bg-accent-soft text-accent" : "border-line bg-card hover:border-accent",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- 3. topics

function TopicsStep({ initial, onBack, onDone, pending }: { initial: string[]; onBack: () => void; onDone: (t: string[]) => void; pending: boolean }) {
  const [sel, setSel] = useState(new Set(initial));
  const toggle = (s: string) => setSel((prev) => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  const parents = TOPICS.filter((t) => !t.parent);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onDone([...sel]); }}>
      <StepHeader title="What do you care about?" sub="Pick broad areas, or open one to choose specific issues. You'll see the most relevant items first." />
      <div className="space-y-3">
        {parents.map((p) => {
          const children = TOPICS.filter((t) => t.parent === p.slug);
          const anyChild = children.some((c) => sel.has(c.slug));
          return (
            <details key={p.slug} open={anyChild} className="rounded-xl border border-line bg-card px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="font-medium">{p.name}</span>
                <Chip on={sel.has(p.slug)} onClick={() => toggle(p.slug)}>{sel.has(p.slug) ? "Following all" : "Follow all"}</Chip>
              </summary>
              {children.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {children.map((c) => <Chip key={c.slug} on={sel.has(c.slug)} onClick={() => toggle(c.slug)}>{c.name}</Chip>)}
                </div>
              )}
            </details>
          );
        })}
      </div>
      <Nav onBack={onBack} next={`Continue${sel.size ? ` (${sel.size})` : ""}`} pending={pending} />
    </form>
  );
}

// ---------------------------------------------------------------- 4. pet issues

function PetsStep({ initial, aiEnabled, onBack, onDone }: { initial: PetIssue[]; aiEnabled: boolean; onBack: () => void; onDone: () => void }) {
  const [pets, setPets] = useState(initial);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      setError("");
      const res = await addPetIssue(label);
      if (!res.ok) return setError(res.error);
      setPets((p) => [...p, res.issue]);
      setLabel("");
    });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onDone(); }}>
      <StepHeader
        title="Your pet issues"
        sub="The specific things you never want to miss. We'll put these at the top and alert you when a comment period, vote or hearing comes up."
      />
      <div className="flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (label.trim()) add(); } }}
          placeholder="e.g. climbing access in national parks"
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2"
          aria-label="Pet issue"
        />
        <Button type="button" variant="secondary" onClick={add} disabled={pending || !label.trim()}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-urgent">{error}</p>}
      <p className="mt-2 text-xs text-muted">
        {aiEnabled ? "We'll work out related topics and search terms; you can edit the terms." : "We'll match on the words you use; edit the search terms to fine-tune."}
      </p>

      <ul className="mt-5 space-y-3">
        {pets.map((pet) => <PetRow key={pet.id} pet={pet} onRemove={() => { setPets((ps) => ps.filter((x) => x.id !== pet.id)); removeInterest(pet.id); }} />)}
      </ul>
      <Nav onBack={onBack} next={pets.length ? "Continue" : "Skip for now"} />
    </form>
  );
}

function PetRow({ pet, onRemove }: { pet: PetIssue; onRemove: () => void }) {
  const [keywords, setKeywords] = useState(pet.keywords.join(", "));
  return (
    <li>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">{pet.label}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pet.topic_slugs.map((t) => <Pill key={t} tone="pet">{topicName(t)}</Pill>)}
            </div>
          </div>
          <Button type="button" variant="ghost" onClick={onRemove} aria-label={`Remove ${pet.label}`}>Remove</Button>
        </div>
        <label className="mt-3 block text-xs text-muted">
          Search terms (comma-separated)
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onBlur={() => updatePetKeywords(pet.id, keywords.split(","))}
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink"
          />
        </label>
      </Card>
    </li>
  );
}

// ---------------------------------------------------------------- 5. alerts

function AlertsStep({ initial, onBack, onDone, pending }: { initial: { alerts: boolean; digest: boolean }; onBack: () => void; onDone: (p: { alerts: boolean; digest: boolean }) => void; pending: boolean }) {
  const [prefs, setPrefs] = useState(initial);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onDone(prefs); }}>
      <StepHeader title="Stay in the loop" sub="Email only. No spam, no fundraising, ever." />
      <div className="space-y-3">
        <Toggle
          checked={prefs.alerts}
          onChange={(alerts) => setPrefs((p) => ({ ...p, alerts }))}
          title="Pet issue alerts"
          body="An email when something new comes up on a pet issue, and a reminder 3 days before a deadline."
        />
        <Toggle
          checked={prefs.digest}
          onChange={(digest) => setPrefs((p) => ({ ...p, digest }))}
          title="Weekly digest"
          body="Monday morning: what's coming up that affects you, and what your reps did last week."
        />
      </div>
      <Nav onBack={onBack} next="See my feed" pending={pending} />
    </form>
  );
}

function Toggle({ checked, onChange, title, body }: { checked: boolean; onChange: (v: boolean) => void; title: string; body: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-card p-4">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--color-accent)]" />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted">{body}</span>
      </span>
    </label>
  );
}
