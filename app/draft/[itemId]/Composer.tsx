"use client";
import { useState, useTransition } from "react";
import { copyablePrompt, STANCE_LABEL, type DraftKind, type Stance } from "@/lib/ai/draftPrompt";
import { logAction } from "@/app/actions";
import { Button, Card, cx } from "@/components/ui";

type Props = {
  aiEnabled: boolean;
  isComment: boolean;
  item: { id: string; title: string; type: string; url: string | null; external_id: string; agency: string | null; comment_deadline: string | null; summary: string | null; action_url: string | null };
  officials: { id: string; name: string; office: string }[];
  initialOfficialId: string | null;
  initialKind: DraftKind;
  contact: { email: string | null; form: string | null; phone: string | null };
  place: string | null;
};

export function Composer(p: Props) {
  const [kind, setKind] = useState<DraftKind>(p.initialKind);
  const [officialId, setOfficialId] = useState(p.initialOfficialId);
  const [stance, setStance] = useState<Stance>("support");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"draft" | "prompt" | null>(null);
  const [logged, setLogged] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const official = p.officials.find((o) => o.id === officialId) ?? null;
  const input = { kind, stance, personalNote: note, item: p.item, official, place: p.place };
  const noteOk = note.trim().length >= 10;

  async function generate() {
    setStatus("streaming");
    setError("");
    setDraft("");
    const res = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: p.item.id, officialId: kind === "public_comment" ? null : officialId, kind, stance, personalNote: note }),
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
      setError("The draft was interrupted. Try again, or use “Copy prompt”.");
    }
  }

  async function copy(text: string, what: "draft" | "prompt") {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  const subject = draft.match(/^Subject:\s*(.+)$/m)?.[1] ?? p.item.title;
  const body = draft.replace(/^Subject:.*\n+/m, "");
  const sentType = kind === "public_comment" ? "commented" : kind === "call_script" ? "called" : "emailed";

  return (
    <div className="space-y-5">
      {!p.isComment && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">How do you want to reach out?</legend>
          <div className="flex gap-2">
            {(["email", "call_script"] as const).map((k) => (
              <Seg key={k} on={kind === k} onClick={() => setKind(k)}>{k === "email" ? "Email" : "Phone call script"}</Seg>
            ))}
          </div>
        </fieldset>
      )}

      {!p.isComment && p.officials.length > 1 && (
        <label className="block text-sm font-medium">
          To
          <select value={officialId ?? ""} onChange={(e) => setOfficialId(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2">
            {p.officials.map((o) => <option key={o.id} value={o.id}>{o.name} — {o.office}</option>)}
          </select>
        </label>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Your position</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STANCE_LABEL) as Stance[]).map((s) => <Seg key={s} on={stance === s} onClick={() => setStance(s)}>{STANCE_LABEL[s]}</Seg>)}
        </div>
      </fieldset>

      <label className="block text-sm font-medium">
        Why does this matter to you?
        <span className="block font-normal text-muted">
          One or two sentences in your own words. This is what makes a message count: staff discount identical form letters.
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="e.g. I've climbed at Indian Creek every spring for ten years and volunteer on trail crews there."
          className="mt-2 w-full rounded-lg border border-line bg-card px-3 py-2 font-normal"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        {p.aiEnabled && (
          <Button onClick={generate} disabled={!noteOk || status === "streaming"}>
            {status === "streaming" ? "Writing…" : draft ? "Rewrite" : "Write my draft"}
          </Button>
        )}
        <Button variant="secondary" disabled={!noteOk} onClick={() => copy(copyablePrompt(input), "prompt")}>
          {copied === "prompt" ? "Copied!" : "Copy prompt for any AI"}
        </Button>
      </div>
      {!p.aiEnabled && <p className="text-sm text-muted">Paste the prompt into ChatGPT, Claude, Gemini or any assistant (free tiers work), then paste the result below.</p>}
      {error && <p className="text-sm text-urgent">{error}</p>}

      <label className="block text-sm font-medium">
        Your message
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={14}
          placeholder={p.aiEnabled ? "Your draft will appear here. Edit it so it sounds like you." : "Paste or write your message here."}
          className="mt-2 w-full rounded-lg border border-line bg-card px-3 py-2 font-normal leading-relaxed"
        />
      </label>

      {draft && (
        <Card className="space-y-3">
          <p className="font-medium">Send it</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => copy(draft, "draft")}>{copied === "draft" ? "Copied!" : "Copy message"}</Button>
            {kind === "email" && p.contact.email && (
              <a className={btn} href={`mailto:${p.contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>Open in email app</a>
            )}
            {kind === "email" && !p.contact.email && p.contact.form && <a className={btn} href={p.contact.form} target="_blank" rel="noreferrer">Open contact form ↗</a>}
            {kind === "call_script" && p.contact.phone && <a className={btn} href={`tel:${p.contact.phone.replace(/[^\d+]/g, "")}`}>Call {p.contact.phone}</a>}
            {kind === "public_comment" && p.item.action_url && <a className={btn} href={p.item.action_url} target="_blank" rel="noreferrer">Open comment form ↗</a>}
          </div>
          <div className="border-t border-line pt-3">
            <Button
              disabled={pending || !!logged}
              onClick={() =>
                start(async () => {
                  const res = await logAction(sentType, p.item.id, kind === "public_comment" ? null : officialId);
                  const badges = res.newBadges.map((b) => `${b.icon} ${b.name}`).join(", ");
                  setLogged(res.duplicate ? "Already logged — thanks!" : `Nice work! +${res.points} points${badges ? ` · New badge: ${badges}` : ""}`);
                })
              }
            >
              {kind === "public_comment" ? "I submitted it" : kind === "call_script" ? "I called" : "I sent it"}
            </Button>
            {logged && <p role="status" className="mt-2 text-sm font-medium text-accent">{logged}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

const btn = "inline-flex items-center rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium hover:border-accent";

function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx("rounded-lg border px-3 py-1.5 text-sm", on ? "border-accent bg-accent-soft text-accent" : "border-line bg-card hover:border-accent")}
    >
      {children}
    </button>
  );
}
