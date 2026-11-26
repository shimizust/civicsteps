"use client";

import Link from "next/link";
import { useState } from "react";
import { FactQuestion } from "@/components/FactQuestion";
import { Button, Card } from "@/components/ui";
import type { RankedQuestion } from "@/lib/impact";

const PAGE_SIZE = 3;

export function QuickQuestions({ questions }: { questions: RankedQuestion[] }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(questions.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const start = currentPage * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, questions.length);

  if (!questions.length) return null;

  return (
    <Card className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Quick questions</h2>
      <p className="mt-1 text-sm text-muted">
        <strong className="font-medium text-ink">Your answers help us estimate how current and future civic items affect you.</strong>{" "}
        Skip any question you&apos;re unsure about. You can change saved answers in your{" "}
        <Link className="text-accent underline" href="/profile">profile</Link>.
      </p>
      <div className="mt-1 divide-y divide-line">
        {questions.slice(start, end).map((q) => (
          <FactQuestion
            key={`${q.kind}:${q.key}`}
            q={q}
            source="feed"
            hint={`Helps personalize ${q.itemCount} current ${q.itemCount === 1 ? "item" : "items"}`}
          />
        ))}
      </div>
      {pageCount > 1 && (
        <nav aria-label="Quick questions pages" className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <p className="text-xs text-muted" aria-live="polite">
            {end === start + 1 ? `Question ${end}` : `Questions ${start + 1}–${end}`} of {questions.length}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
              Previous
            </Button>
            <Button type="button" variant="secondary" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>
              Next
            </Button>
          </div>
        </nav>
      )}
    </Card>
  );
}
