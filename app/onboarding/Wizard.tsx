"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, ChevronDown, Mail, MapPin, Plus, Sparkles } from "lucide-react";
import { DEMOGRAPHIC_QUESTIONS as QUESTIONS, TOPICS, topicName, type Demographics } from "@/lib/taxonomy";
import { BackLink } from "@/components/BackLink";
import { TopicTile } from "@/components/TopicTile";
import { Button, Card, Input, Kicker, Pill, cx } from "@/components/ui";
import { saveZip, type ZipResult } from "@/app/zip-actions";
import {
  addPetIssue,
  finishOnboarding,
  removeInterest,
  saveDemographics,
  saveTopics,
  updatePetKeywords,
  type PetIssue,
} from "./actions";

type Props = {
  initialStep: number;
  returning: boolean;
  zip: string;
  place: string | null;
  officialsCount: number;
  demographics: Demographics;
  topics: string[];
  pets: PetIssue[];
  prefs: { alerts: boolean; digest: boolean };
  aiEnabled: boolean;
};

const STEPS = ["ZIP code", "About you", "Topics", "Pet issues", "Alerts"];

export function Wizard(p: Props) {
  const router = useRouter();
  const [step, setStep] = useState(p.initialStep);
  const [pending, start] = useTransition();
  const next = () => setStep((s) => Math.min(s + 1, 5));
  const back = () => setStep((s) => Math.max(s - 1, 1));

  return (
    <div className="mx-auto max-w-2xl">
      {p.returning && <BackLink fallbackHref="/profile" fallbackLabel="Back to profile" className="mb-4" />}

      {p.returning ? (
        <nav aria-label="Settings sections" className="mb-8 flex flex-wrap gap-1.5 border-b border-line pb-4">
          {STEPS.map((label, i) => {
            const active = i + 1 === step;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStep(i + 1)}
                aria-current={active ? "step" : undefined}
                className={cx(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  active
                    ? "border-accent bg-accent text-white dark:text-paper"
                    : "border-line bg-card text-muted hover:border-accent hover:text-ink",
                )}
              >
                {label}
              </button>
            );
          })}
        </nav>
      ) : (
        <ol className="mb-8 flex gap-1.5" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li key={label} className="flex-1">
              <button
                type="button"
                onClick={() => (i + 1 < step ? setStep(i + 1) : undefined)}
                className={cx(
                  "h-1.5 w-full rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  i + 1 <= step ? "bg-accent" : "bg-line",
                )}
                aria-label={`Step ${i + 1}: ${label}`}
                aria-current={i + 1 === step ? "step" : undefined}
              />
              <span className={cx("mt-1.5 hidden text-xs sm:block", i + 1 === step ? "font-medium text-ink" : "text-muted")}>
                {label}
              </span>
            </li>
          ))}
        </ol>
      )}

      {step === 1 && (
        <ZipStep
          initial={p.zip}
          place={p.place}
          officialsCount={p.officialsCount}
          returning={p.returning}
          onDone={next}
          onReturnProfile={() => router.push("/profile")}
        />
      )}
      {step === 2 && (
        <AboutStep
          initial={p.demographics}
          returning={p.returning}
          onBack={back}
          onSkip={next}
          onDone={(d, dest) =>
            start(async () => {
              await saveDemographics(d);
              if (dest === "/profile") router.push("/profile");
              else next();
            })
          }
          pending={pending}
        />
      )}
      {step === 3 && (
        <TopicsStep
          initial={p.topics}
          returning={p.returning}
          onBack={back}
          onDone={(t, dest) =>
            start(async () => {
              await saveTopics(t);
              if (dest === "/profile") router.push("/profile");
              else next();
            })
          }
          pending={pending}
        />
      )}
      {step === 4 && (
        <PetsStep
          initial={p.pets}
          aiEnabled={p.aiEnabled}
          returning={p.returning}
          onBack={back}
          onDone={next}
          onReturnProfile={() => router.push("/profile")}
        />
      )}
      {step === 5 && (
        <AlertsStep
          initial={p.prefs}
          returning={p.returning}
          onBack={back}
          onDone={(prefs, dest) => start(() => finishOnboarding(prefs, dest))}
          pending={pending}
        />
      )}
    </div>
  );
}

function StepHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="mb-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 leading-relaxed text-muted">{sub}</p>
    </header>
  );
}

function Nav({
  onBack,
  next,
  pending,
  disabled,
  secondary,
}: {
  onBack?: () => void;
  next: React.ReactNode;
  pending?: boolean;
  disabled?: boolean;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {secondary}
        <Button type="submit" disabled={pending || disabled}>
          {pending ? "Saving…" : next}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 1. zip

function ZipStep({
  initial,
  place,
  officialsCount,
  returning,
  onDone,
  onReturnProfile,
}: {
  initial: string;
  place: string | null;
  officialsCount: number;
  returning: boolean;
  onDone: () => void;
  onReturnProfile: () => void;
}) {
  const [zip, setZip] = useState(initial);
  const [result, setResult] = useState<ZipResult | null>(null);
  const [submitted, setSubmitted] = useState(initial);
  const [pending, start] = useTransition();
  const confirmed = (result?.ok && zip === submitted) || (!result && !!initial && zip === initial);

  function runLookup() {
    start(async () => {
      setSubmitted(zip);
      setResult(await saveZip(zip));
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmed) return returning ? onReturnProfile() : onDone();
        runLookup();
      }}
    >
      <StepHeader
        title="Where do you live?"
        sub="Your ZIP code tells us your city, county and legislative districts, so we can find your representatives. It's never shared or sent to an AI."
      />

      {!result && initial && (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 bg-accent-soft/30">
          <div className="flex items-center gap-2.5 text-sm">
            <MapPin className="h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span>
              Currently saved: <strong className="tabular-nums">ZIP {initial}</strong>
              {place ? ` (${place})` : ""} · <span className="tabular-nums text-muted">{officialsCount} representatives linked</span>
            </span>
          </div>
        </Card>
      )}

      <label htmlFor="zip" className="block text-sm font-medium">
        ZIP code
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Input
          id="zip"
          value={zip}
          onChange={(e) => {
            setZip(e.target.value);
            setResult(null);
          }}
          autoComplete="postal-code"
          inputMode="numeric"
          maxLength={10}
          placeholder="80302"
          className="max-w-40 tabular-nums"
        />
        <Button type="button" variant="secondary" onClick={runLookup} disabled={pending || !zip.trim()}>
          {pending ? "Looking up…" : "Look up ZIP"}
        </Button>
      </div>

      {result && !result.ok && <p className="mt-2 text-sm text-cost">{result.error}</p>}
      {result?.ok && (
        <Card className="mt-4">
          <Kicker>Found</Kicker>
          <p className="mt-0.5 font-medium tabular-nums">ZIP {result.zip}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {result.summary.map((s) => (
              <Pill key={s}>{s}</Pill>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">
            <span className="tabular-nums">{result.officials}</span> representatives linked.
            {result.stateLookup === "skipped" && " State legislators aren't available for your area yet — we'll add them automatically once supported."}
            {result.stateLookup === "failed" && " We couldn't look up your state legislators right now; we'll retry later."}
          </p>
          {result.coverage && result.coverage.length > 0 && (
            <p className="mt-2 text-sm text-muted">
              We&apos;re preparing to index recent {listJoin(result.coverage)}. You can follow progress in your civic feed.
            </p>
          )}
          <p className="mt-2 text-xs text-muted">
            Some ZIP codes cross district lines. We use the middle of yours, so a district near the edge may be off.
          </p>
        </Card>
      )}

      <Nav
        next={confirmed ? (returning ? "Done" : "Continue") : "Look up ZIP"}
        pending={pending}
        disabled={!zip.trim()}
        secondary={
          returning && confirmed ? (
            <Button type="button" variant="ghost" onClick={onDone}>
              Next step
            </Button>
          ) : undefined
        }
      />
    </form>
  );
}

const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// ---------------------------------------------------------------- 2. about you

const CHOICE_GROUPS = [
  { title: "Home & getting around", keys: ["housing", "area", "commute"] as const },
  { title: "Work & health coverage", keys: ["work", "coverage", "income"] as const },
];

function AboutStep({
  initial,
  returning,
  onBack,
  onSkip,
  onDone,
  pending,
}: {
  initial: Demographics;
  returning: boolean;
  onBack: () => void;
  onSkip: () => void;
  onDone: (d: Demographics, dest: "/next" | "/profile") => void;
  pending: boolean;
}) {
  const [d, setD] = useState<Demographics>(initial);
  const [dest, setDest] = useState<"/next" | "/profile">("/next");
  const set = (k: keyof Demographics, v: unknown) => setD((prev) => ({ ...prev, [k]: prev[k] === v ? undefined : v }));
  const byKey = new Map(QUESTIONS.map((q) => [q.key, q]));
  const ageQ = byKey.get("age");
  const bools = QUESTIONS.filter((q) => q.kind === "bool");
  const answered = Object.values(d).filter((v) => v !== undefined).length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onDone(d, dest);
      }}
    >
      <StepHeader
        title="A little about you"
        sub="Optional. Broad ranges used only to highlight issues that affect people like you. Skip anything — we'll ask one quick question later only when a specific bill depends on it."
      />

      <div className="mb-4 flex items-center justify-between text-xs text-muted">
        <span className="tabular-nums">{answered} answered</span>
        {!returning && (
          <button
            type="button"
            onClick={onSkip}
            className="rounded font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Skip this step →
          </button>
        )}
      </div>

      <div className="space-y-4">
        {CHOICE_GROUPS.map((group) => (
          <Card key={group.title} className="space-y-4">
            <Kicker className="block">{group.title}</Kicker>
            {group.keys.map((k) => {
              const q = byKey.get(k);
              if (!q || q.kind !== "choice") return null;
              return (
                <fieldset key={q.key}>
                  <legend className="mb-2 text-sm font-medium">{q.label}</legend>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map(([v, label]) => (
                      <Chip key={v} on={d[q.key] === v} onClick={() => set(q.key, v)}>
                        {label}
                      </Chip>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </Card>
        ))}

        <Card className="space-y-4">
          <Kicker className="block">Household &amp; lifestyle</Kicker>
          {ageQ && ageQ.kind === "choice" && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{ageQ.label}</legend>
              <div className="flex flex-wrap gap-2">
                {ageQ.options.map(([v, label]) => (
                  <Chip key={v} on={d[ageQ.key] === v} onClick={() => set(ageQ.key, v)}>
                    {label}
                  </Chip>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Any of these apply?</legend>
            <div className="flex flex-wrap gap-2">
              {bools.map((q) => (
                <Chip key={q.key} on={d[q.key] === true} onClick={() => set(q.key, true)}>
                  {q.label}
                </Chip>
              ))}
            </div>
          </fieldset>
        </Card>
      </div>

      <Nav
        onBack={onBack}
        next={returning ? "Save & continue" : "Continue"}
        pending={pending}
        secondary={
          returning ? (
            <Button type="submit" variant="secondary" disabled={pending} onClick={() => setDest("/profile")}>
              Save &amp; back to profile
            </Button>
          ) : undefined
        }
      />
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
        e.stopPropagation();
        onClick();
      }}
      className={cx(
        "rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        on ? "border-accent bg-accent-soft font-medium text-accent" : "border-line bg-card hover:border-accent",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- 3. topics

function TopicsStep({
  initial,
  returning,
  onBack,
  onDone,
  pending,
}: {
  initial: string[];
  returning: boolean;
  onBack: () => void;
  onDone: (t: string[], dest: "/next" | "/profile") => void;
  pending: boolean;
}) {
  const [sel, setSel] = useState(new Set(initial));
  const [dest, setDest] = useState<"/next" | "/profile">("/next");
  const toggle = (s: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });
  const parents = TOPICS.filter((t) => !t.parent);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onDone([...sel], dest);
      }}
    >
      <StepHeader
        title="What do you care about?"
        sub="Follow broad areas, or expand any topic to choose specific issues. You'll see the most relevant items first."
      />
      <div className="space-y-2.5">
        {parents.map((p) => {
          const children = TOPICS.filter((t) => t.parent === p.slug);
          const childHits = children.filter((c) => sel.has(c.slug)).length;
          const allSelected = sel.has(p.slug);
          return (
            <details key={p.slug} open={childHits > 0} className="group rounded-xl border border-line bg-card px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <TopicTile topics={[p.slug]} size="sm" />
                  <div className="min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    {children.length > 0 && (
                      <span className="text-xs text-muted tabular-nums">
                        {allSelected
                          ? "Following all sub-topics"
                          : childHits > 0
                            ? `${childHits} of ${children.length} selected`
                            : `${children.length} sub-topics`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Chip on={allSelected} onClick={() => toggle(p.slug)}>
                    {allSelected ? "Following all" : "Follow all"}
                  </Chip>
                  {children.length > 0 && (
                    <ChevronDown
                      className="h-4 w-4 text-muted transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  )}
                </div>
              </summary>
              {children.length > 0 && (
                <div className="mt-3 border-t border-line/70 pt-3">
                  {allSelected && (
                    <p className="mb-2 text-xs text-muted">
                      You&apos;re following everything in {p.name}. Pick specific sub-topics too if you want extra emphasis.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {children.map((c) => (
                      <Chip key={c.slug} on={sel.has(c.slug)} onClick={() => toggle(c.slug)}>
                        {c.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </details>
          );
        })}
      </div>
      <Nav
        onBack={onBack}
        next={`${returning ? "Save & continue" : "Continue"}${sel.size ? ` (${sel.size})` : ""}`}
        pending={pending}
        secondary={
          returning ? (
            <Button type="submit" variant="secondary" disabled={pending} onClick={() => setDest("/profile")}>
              Save &amp; back to profile
            </Button>
          ) : undefined
        }
      />
    </form>
  );
}

// ---------------------------------------------------------------- 4. pet issues

const PET_EXAMPLES = [
  "Climbing access in national parks",
  "Local bus and bike lanes",
  "Renters' protections",
  "Clean drinking water",
  "AI and data privacy",
];

function PetsStep({
  initial,
  aiEnabled,
  returning,
  onBack,
  onDone,
  onReturnProfile,
}: {
  initial: PetIssue[];
  aiEnabled: boolean;
  returning: boolean;
  onBack: () => void;
  onDone: () => void;
  onReturnProfile: () => void;
}) {
  const [pets, setPets] = useState(initial);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const addText = (text: string) =>
    start(async () => {
      setError("");
      const res = await addPetIssue(text);
      if (!res.ok) return setError(res.error);
      setPets((p) => [...p, res.issue]);
      if (text === label) setLabel("");
    });

  const existingLabels = new Set(pets.map((p) => p.label.toLowerCase()));
  const suggestions = PET_EXAMPLES.filter((e) => !existingLabels.has(e.toLowerCase()));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (returning) onReturnProfile();
        else onDone();
      }}
    >
      <StepHeader
        title="Your pet issues"
        sub="The specific things you never want to miss. We'll put these at the top and alert you when a comment period, vote or hearing comes up."
      />
      <div className="flex gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (label.trim()) addText(label);
            }
          }}
          placeholder="e.g. climbing access in national parks"
          className="min-w-0 flex-1"
          aria-label="Pet issue"
        />
        <Button type="button" variant="secondary" onClick={() => addText(label)} disabled={pending || !label.trim()}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-cost">{error}</p>}
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        {aiEnabled
          ? "We'll work out related topics and search terms; you can edit the terms below."
          : "We'll match on the words you use; edit the search terms below to fine-tune."}
      </p>

      {pets.length < 3 && suggestions.length > 0 && (
        <div className="mt-4">
          <Kicker className="block">Try an example</Kicker>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={pending}
                onClick={() => addText(ex)}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-3 py-1 text-xs text-muted transition hover:border-pet hover:text-pet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
              >
                <Plus className="h-3 w-3" aria-hidden />
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className="mt-5 space-y-3">
        {pets.map((pet) => (
          <PetRow
            key={pet.id}
            pet={pet}
            onRemove={() => {
              setPets((ps) => ps.filter((x) => x.id !== pet.id));
              removeInterest(pet.id);
            }}
          />
        ))}
      </ul>
      <Nav
        onBack={onBack}
        next={returning ? "Done" : pets.length ? "Continue" : "Skip for now"}
        secondary={
          returning ? (
            <Button type="button" variant="ghost" onClick={onDone}>
              Next step
            </Button>
          ) : undefined
        }
      />
    </form>
  );
}

function PetRow({ pet, onRemove }: { pet: PetIssue; onRemove: () => void }) {
  const initial = pet.keywords.join(", ");
  const [keywords, setKeywords] = useState(initial);
  const [lastSaved, setLastSaved] = useState(initial);
  const [savedNotice, setSavedNotice] = useState(false);
  const [pending, start] = useTransition();

  function saveTerms() {
    if (keywords === lastSaved) return;
    start(async () => {
      await updatePetKeywords(pet.id, keywords.split(","));
      setLastSaved(keywords);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    });
  }

  return (
    <li>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">{pet.label}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pet.topic_slugs.map((t) => (
                <Pill key={t} tone="pet">
                  {topicName(t)}
                </Pill>
              ))}
            </div>
          </div>
          <Button type="button" variant="ghost" onClick={onRemove} aria-label={`Remove ${pet.label}`}>
            Remove
          </Button>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`kw-${pet.id}`} className="text-xs text-muted">
              Search terms (comma-separated)
            </label>
            {savedNotice && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-benefit">
                <Check className="h-3.5 w-3.5" aria-hidden /> Saved
              </span>
            )}
          </div>
          <div className="mt-1 flex gap-2">
            <Input
              id={`kw-${pet.id}`}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              onBlur={saveTerms}
              className="bg-paper py-1.5 text-sm"
            />
            {keywords !== lastSaved && (
              <Button type="button" variant="secondary" disabled={pending} onClick={saveTerms} className="shrink-0 !py-1.5 text-xs">
                {pending ? "Saving…" : "Save"}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}

// ---------------------------------------------------------------- 5. alerts

function AlertsStep({
  initial,
  returning,
  onBack,
  onDone,
  pending,
}: {
  initial: { alerts: boolean; digest: boolean };
  returning: boolean;
  onBack: () => void;
  onDone: (p: { alerts: boolean; digest: boolean }, dest: "/feed" | "/profile") => void;
  pending: boolean;
}) {
  const [prefs, setPrefs] = useState(initial);
  const [dest, setDest] = useState<"/feed" | "/profile">(returning ? "/profile" : "/feed");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onDone(prefs, dest);
      }}
    >
      <StepHeader title="Stay in the loop" sub="Email only. No spam, no fundraising, ever." />
      <div className="space-y-3">
        <Toggle
          icon={<Bell className="h-5 w-5 text-pet" aria-hidden />}
          checked={prefs.alerts}
          onChange={(alerts) => setPrefs((p) => ({ ...p, alerts }))}
          title="Pet issue alerts"
          body="An email when something new comes up on a pet issue, and a reminder 3 days before a deadline."
        />
        <Toggle
          icon={<Mail className="h-5 w-5 text-accent" aria-hidden />}
          checked={prefs.digest}
          onChange={(digest) => setPrefs((p) => ({ ...p, digest }))}
          title="Weekly digest"
          body="Monday morning: what's coming up that affects you, and what your reps did last week."
        />
      </div>
      <Nav
        onBack={onBack}
        next={returning ? "Save preferences" : "See my feed"}
        pending={pending}
        secondary={
          returning ? (
            <Button type="submit" variant="secondary" disabled={pending} onClick={() => setDest("/feed")}>
              Save &amp; go to feed
            </Button>
          ) : undefined
        }
      />
    </form>
  );
}

function Toggle({
  icon,
  checked,
  onChange,
  title,
  body,
}: {
  icon: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  body: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3.5 rounded-xl border border-line bg-card p-4 transition hover:border-accent">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
      />
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{body}</span>
      </span>
    </label>
  );
}
