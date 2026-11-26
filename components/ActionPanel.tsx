"use client";
import { useEffect, useState, useTransition } from "react";
import { Award, Check } from "lucide-react";
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
  const [toast, setToast] = useState<{ text: string; hasBadge: boolean } | null>(null);
  const [pending, start] = useTransition();

  const mark = (type: ActionType) =>
    start(async () => {
      const res = await logAction(type, itemId);
      setDid((d) => new Set(d).add(type));
      if (res.duplicate) return setToast({ text: "Already logged — thanks!", hasBadge: false });
      const badges = res.newBadges.map((b) => b.name).join(", ");
      setToast({
        text: `+${res.points} points${badges ? ` · New badge: ${badges}` : ""}`,
        hasBadge: res.newBadges.length > 0,
      });
    });

  return (
    <div>
      <p className="mb-2.5 text-sm text-muted">Did something? Log it to earn points and keep your streak going.</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => {
          const doneAlready = did.has(a);
          return (
            <Button key={a} variant={doneAlready ? "primary" : "secondary"} disabled={pending || doneAlready} onClick={() => mark(a)}>
              {doneAlready && <Check className="h-3.5 w-3.5" aria-hidden />}
              {LABELS[a]}
            </Button>
          );
        })}
      </div>
      {toast && (
        <p role="status" className="mt-3 flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
          {toast.hasBadge && <Award className="h-4 w-4 shrink-0" aria-hidden />}
          <span>{toast.text}</span>
        </p>
      )}
    </div>
  );
}
