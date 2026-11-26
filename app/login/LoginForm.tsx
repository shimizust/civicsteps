"use client";
import { useState } from "react";
import { MailCheck, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { Button, Card, Input } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [resent, setResent] = useState(false);

  async function sendLink() {
    setState("sending");
    setResent(false);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else {
      setState("sent");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await sendLink();
  }

  if (state === "sent")
    return (
      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <MailCheck className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="font-medium">Check your email</p>
            <p className="mt-1 text-sm text-muted">We sent a sign-in link to {email}.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              await sendLink();
              setResent(true);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Resend link
          </Button>
          <Button type="button" variant="ghost" onClick={() => setState("idle")}>
            Use a different email
          </Button>
        </div>
        {resent && <p role="status" className="text-xs font-medium text-accent">Sent another sign-in link.</p>}
      </Card>
    );

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-medium" htmlFor="email">
        Email
      </label>
      <Input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <Button type="submit" disabled={state === "sending"} className="w-full">
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </Button>
      {state === "error" && <p className="text-sm text-cost">{message}</p>}
    </form>
  );
}
