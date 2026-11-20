"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else setState("sent");
  }

  if (state === "sent")
    return (
      <div className="rounded-xl border border-line bg-card p-5">
        <p className="font-medium">Check your email</p>
        <p className="mt-1 text-sm text-muted">We sent a sign-in link to {email}.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-medium" htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg border border-line bg-card px-3 py-2"
        placeholder="you@example.com"
      />
      <Button type="submit" disabled={state === "sending"} className="w-full">
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </Button>
      {state === "error" && <p className="text-sm text-urgent">{message}</p>}
    </form>
  );
}
