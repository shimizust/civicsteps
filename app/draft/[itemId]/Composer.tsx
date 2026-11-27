"use client";
import { useState, useTransition } from "react";
import { AlertCircle, Award, Check, Copy, ExternalLink, Loader2, Mail, PenLine, Phone, Sparkles } from "lucide-react";
import { copyablePrompt, LAW_RESPONSE_IDS, LAW_RESPONSES, STANCE_LABEL, type DraftInput, type DraftKind, type LawResponse, type Stance } from "@/lib/ai/draftPrompt";
import { logAction } from "@/app/actions";
import { Button, Card, Input, Kicker, Select, Textarea, cx } from "@/components/ui";

type Props = {
  aiEnabled: boolean;
  isComment: boolean;
  item: DraftInput["item"] & { id: string; action_url: string | null };
  officials: {
    id: string;
    name: string;
    office: string;
    email: string | null;
    form: string | null;
    phone: string | null;
    phones?: { label: string; phone: string }[];
  }[];
  initialOfficialId: string | null;
  initialKind: DraftKind;
  place: string | null;
};

const STARTERS = [
  "I live nearby",
  "This affects my household budget",
  "I use this service regularly",
  "This affects my family",
];

function splitEmailDraft(raw: string): { subjectLine: string; bodyText: string; hasSubjectPrefix: boolean } {
  const m = raw.match(/^Subject:\s*(.*)(?:\r?\n|$)([\s\S]*)$/i);
  if (!m) return { subjectLine: "", bodyText: raw, hasSubjectPrefix: false };
  return { subjectLine: m[1].trim(), bodyText: m[2].replace(/^\r?\n+/, ""), hasSubjectPrefix: true };
}

function joinEmailDraft(subjectLine: string, bodyText: string): string {
  const cleanSubj = subjectLine.trim();
  if (!cleanSubj) return bodyText;
  return `Subject: ${cleanSubj}\n\n${bodyText}`;
}

export function Composer(p: Props) {
  const [kind, setKind] = useState<DraftKind>(p.initialKind);
  const [officialId, setOfficialId] = useState(p.initialOfficialId);
  const [stance, setStance] = useState<Stance>("support");
  const [lawResponse, setLawResponse] = useState<LawResponse>();
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState("");
  const [manualEdit, setManualEdit] = useState(false);
  const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"draft" | "prompt" | "subject" | null>(null);
  const [logged, setLogged] = useState<{ text: string; hasBadge: boolean } | null>(null);
  const [pending, start] = useTransition();

  const official = p.officials.find((o) => o.id === officialId) ?? null;
  const isLaw = Boolean(p.item.enacted_at);
  const input = { kind, stance, lawResponse, personalNote: note, item: p.item, official, place: p.place };
  const noteLen = note.trim().length;
  const ready = noteLen >= 10 && (!isLaw || !!lawResponse);

  async function generate() {
    setStatus("streaming");
    setError("");
    setDraft("");
    const res = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: p.item.id,
        officialId: kind === "public_comment" ? null : officialId,
        kind,
        stance,
        lawResponse,
        personalNote: note,
      }),
    });
    if (!res.ok || !res.body) {
      setStatus("error");
      setError((await res.json().catch(() => null))?.error ?? "Something went wrong.");
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        setDraft((d) => d + dec.decode(value, { stream: true }));
      }
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("The draft was interrupted. Try again, or use “Copy prompt for any AI”.");
    }
  }

  async function copy(text: string, what: "draft" | "prompt" | "subject") {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  function appendStarter(starter: string) {
    setNote((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return `${starter}. `;
      const sep = /[.!?]$/.test(trimmed) ? " " : ". ";
      return `${trimmed}${sep}${starter}. `;
    });
  }

  const parsedEmail = splitEmailDraft(draft);
  const subject = parsedEmail.subjectLine || p.item.title;
  const body = parsedEmail.hasSubjectPrefix ? parsedEmail.bodyText : draft;
  const sentType = kind === "public_comment" ? "commented" : kind === "call_script" ? "called" : "emailed";
  const showEditor = !p.aiEnabled || manualEdit || draft.length > 0 || status === "streaming";
  const showSubjectSplit = kind === "email" && status !== "streaming" && (parsedEmail.hasSubjectPrefix || manualEdit);
  const hasNamePlaceholder = /\[your name\]/i.test(draft);

  return (
    <div className="space-y-5">
      {!p.isComment && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">How do you want to reach out?</legend>
          <div className="flex flex-wrap gap-2">
            {(["email", "call_script"] as const).map((k) => (
              <Seg key={k} on={kind === k} onClick={() => setKind(k)}>
                {k === "email" ? "Email" : "Phone call script"}
              </Seg>
            ))}
          </div>
        </fieldset>
      )}

      {!p.isComment && p.officials.length > 1 && (
        <label className="block text-sm font-medium">
          To
          <Select value={officialId ?? ""} onChange={(e) => setOfficialId(e.target.value)} className="mt-1.5">
            {p.officials.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} — {o.office}
              </option>
            ))}
          </Select>
        </label>
      )}

      {isLaw ? (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">What would you like your legislator to do?</legend>
          <p className="mb-2.5 text-sm text-muted">Choose a follow-up goal to pair with your personal story.</p>
          <div className="flex flex-wrap gap-2">
            {LAW_RESPONSE_IDS.map((response) => (
              <Seg key={response} on={lawResponse === response} onClick={() => setLawResponse(response)}>
                {LAW_RESPONSES[response].label}
              </Seg>
            ))}
          </div>
        </fieldset>
      ) : (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Your position</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STANCE_LABEL) as Stance[]).map((s) => (
              <Seg key={s} on={stance === s} onClick={() => setStance(s)}>
                {STANCE_LABEL[s]}
              </Seg>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <label htmlFor="personal-note" className="block text-sm font-medium">
          Why does this matter to you?
          <span className="mt-0.5 block text-sm font-normal text-muted">
            {isLaw
              ? "In a sentence or two, describe how the law affects you and what you want your legislator to address."
              : "In a sentence or two, describe how this issue affects you."}
          </span>
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => appendStarter(s)}
              className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs text-muted transition hover:border-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              + {s}
            </button>
          ))}
        </div>
        <Textarea
          id="personal-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="Example: I commute on this corridor every weekday and higher fares would add $40/month to my budget."
          className="mt-2"
        />
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          {p.aiEnabled && (
            <Button onClick={generate} disabled={!ready || status === "streaming"}>
              {status === "streaming" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Writing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden />
                  {draft ? "Rewrite draft" : "Write my draft"}
                </>
              )}
            </Button>
          )}
          <Button variant="secondary" disabled={!ready} onClick={() => copy(copyablePrompt(input), "prompt")}>
            {copied === "prompt" ? (
              <>
                <Check className="h-4 w-4 text-benefit" aria-hidden />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden />
                Copy prompt for any AI
              </>
            )}
          </Button>
          {p.aiEnabled && !showEditor && (
            <Button type="button" variant="ghost" onClick={() => setManualEdit(true)}>
              <PenLine className="h-4 w-4" aria-hidden />
              Write my own
            </Button>
          )}
        </div>

        {!ready && (
          <p className="mt-2 text-xs text-muted" aria-live="polite">
            {isLaw && !lawResponse
              ? "Choose a follow-up goal above and add a brief personal note to unlock drafting."
              : `Add at least 10 characters about why this matters to you (${noteLen}/10) to unlock drafting.`}
          </p>
        )}
        {!p.aiEnabled && (
          <p className="mt-2 text-sm text-muted">
            Paste the prompt into ChatGPT, Claude, Gemini or any assistant (free tiers work), then paste the result below.
          </p>
        )}
        {error && <p className="mt-2 text-sm text-cost">{error}</p>}
      </div>

      {showEditor && (
        <div className="space-y-3">
          {showSubjectSplit && (
            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="draft-subject" className="text-sm font-medium">
                  Subject line
                </label>
                <button
                  type="button"
                  onClick={() => copy(subject, "subject")}
                  className="inline-flex items-center gap-1 rounded text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {copied === "subject" ? <Check className="h-3.5 w-3.5 text-benefit" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                  {copied === "subject" ? "Copied subject" : "Copy subject"}
                </button>
              </div>
              <Input
                id="draft-subject"
                value={parsedEmail.hasSubjectPrefix ? parsedEmail.subjectLine : ""}
                placeholder={p.item.title}
                onChange={(e) => setDraft(joinEmailDraft(e.target.value, body))}
                className="mt-1.5"
              />
            </div>
          )}

          <label className="block text-sm font-medium">
            {showSubjectSplit ? "Message body" : "Your message"}
            <Textarea
              value={showSubjectSplit ? body : draft}
              onChange={(e) => {
                const nextVal = e.target.value;
                setDraft(showSubjectSplit ? joinEmailDraft(parsedEmail.subjectLine, nextVal) : nextVal);
              }}
              rows={13}
              placeholder={p.aiEnabled ? "Your draft will appear here. Edit it so it sounds like you." : "Paste or write your message here."}
              className="mt-1.5 leading-relaxed"
            />
          </label>
        </div>
      )}

      {draft && status !== "streaming" && (
        <Card className="space-y-4">
          <div>
            <Kicker className="block">Ready to deliver</Kicker>
            <p className="mt-0.5 font-display text-lg font-semibold">Send it</p>
          </div>

          {hasNamePlaceholder && (
            <p className="flex items-center gap-2 rounded-lg bg-urgent-soft px-3 py-2 text-xs font-medium text-urgent">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              Remember to replace <code className="font-mono">[Your name]</code> with your own name before sending.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {kind === "email" && official?.email && (
              <a
                className={primaryLinkBtn}
                href={`mailto:${official.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
              >
                <Mail className="h-4 w-4" aria-hidden />
                Open in email app
              </a>
            )}
            {kind === "email" && !official?.email && official?.form && (
              <a className={primaryLinkBtn} href={official.form} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden />
                Open contact form
              </a>
            )}
            {kind === "call_script" && official?.phone && (
              <a className={primaryLinkBtn} href={`tel:${official.phone.replace(/[^\d+]/g, "")}`}>
                <Phone className="h-4 w-4" aria-hidden />
                Call {official.phone}
                {(official.phones?.length ?? 0) > 1 && (
                  <span className="text-xs opacity-90">
                    ({/washington.*d\.?c/i.test(official.phones![0].label) ? "DC office" : official.phones![0].label})
                  </span>
                )}
              </a>
            )}
            {kind === "public_comment" && p.item.action_url && (
              <a className={primaryLinkBtn} href={p.item.action_url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden />
                Open comment form
              </a>
            )}
            <Button variant="secondary" onClick={() => copy(showSubjectSplit ? body : draft, "draft")}>
              {copied === "draft" ? (
                <>
                  <Check className="h-4 w-4 text-benefit" aria-hidden />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" aria-hidden />
                  {showSubjectSplit ? "Copy message body" : "Copy message"}
                </>
              )}
            </Button>
          </div>

          {kind === "call_script" && (official?.phones?.length ?? 0) > 1 && (
            <div className="rounded-lg border border-line bg-paper p-3 text-xs">
              <p className="text-muted">
                Start with the {/washington.*d\.?c/i.test(official!.phones![0].label) ? "DC" : "Capitol"} office above. If the line is busy or voicemail is full, try a local office—staff log constituent calls at every location:
              </p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                {official!.phones!.slice(1).map((lp, i) => (
                  <li key={`${lp.phone}-${i}`} className="inline-flex items-baseline gap-1.5">
                    <span className="font-medium text-ink">{lp.label}:</span>
                    <a
                      className="inline-flex items-center gap-1 rounded text-accent tabular-nums hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      href={`tel:${lp.phone.replace(/[^\d+]/g, "")}`}
                    >
                      <Phone className="h-3 w-3" aria-hidden />
                      {lp.phone}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-line pt-3.5">
            <Button
              disabled={pending || !!logged}
              onClick={() =>
                start(async () => {
                  const res = await logAction(sentType, p.item.id, kind === "public_comment" ? null : officialId);
                  const badges = res.newBadges.map((b) => b.name).join(", ");
                  setLogged({
                    text: res.duplicate ? "Already logged — thanks!" : `Nice work! +${res.points} points${badges ? ` · New badge: ${badges}` : ""}`,
                    hasBadge: res.newBadges.length > 0,
                  });
                })
              }
            >
              <Check className="h-4 w-4" aria-hidden />
              {kind === "public_comment" ? "I submitted it" : kind === "call_script" ? "I called" : "I sent it"}
            </Button>
            {logged && (
              <p role="status" className="mt-2.5 flex items-center gap-2 text-sm font-medium text-accent">
                {logged.hasBadge && <Award className="h-4 w-4 shrink-0" aria-hidden />}
                <span>{logged.text}</span>
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

const primaryLinkBtn =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:text-paper";

function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "rounded-lg border px-3 py-1.5 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        on ? "border-accent bg-accent-soft font-medium text-accent" : "border-line bg-card hover:border-accent",
      )}
    >
      {children}
    </button>
  );
}
