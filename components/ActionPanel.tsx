"use client";
import { useEffect, useState, useTransition } from "react";
import { logAction } from "@/app/actions";
import type { ActionType } from "@/lib/gamification";
import { Button } from "@/components/ui";

export function MarkRead({ itemId }: { itemId: string }) {
  useEffect(() => {
    logAction("read", itemId).catch(() => {});
  }, [itemId]);
  return null;
}

const LABELS: Partial<Record<ActionType, string>> = {
  emailed: "I sent an email",
  called: "I called",
  commented: "I submitted a comment",
  signed: "I signed",
  attended: "I attended / testified",
  shared: "I shared it",
};

export function ActionPanel({ itemId, actions, done }: { itemId: string; actions: ActionType[]; done: ActionType[] }) {
  const [did, setDid] = useState(new Set(done));
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const mark = (type: ActionType) =>
    start(async () => {
      const res = await logAction(type, itemId);
      setDid((d) => new Set(d).add(type));
      if (res.duplicate) return setToast("Already logged — thanks!");
      const badges = res.newBadges.map((b) => `${b.icon} ${b.name}`).join(", ");
      setToast(`+${res.points} points${badges ? ` · New badge: ${badges}` : ""}`);
    });

  return (
    <div>
      <p className="mb-2 text-sm text-muted">Did something? Log it to earn points and keep your streak going.</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a} variant={did.has(a) ? "primary" : "secondary"} disabled={pending || did.has(a)} onClick={() => mark(a)}>
            {did.has(a) ? "✓ " : ""}{LABELS[a]}
          </Button>
        ))}
      </div>
      {toast && (
        <p role="status" className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
          {toast}
        </p>
      )}
    </div>
  );
}
