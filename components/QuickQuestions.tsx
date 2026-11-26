"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import { FactQuestion } from "@/components/FactQuestion";
import { Button, Card, Kicker } from "@/components/ui";
import type { RankedQuestion } from "@/lib/impact";

/**
 * Surfaces the highest-leverage unanswered personal question one at a time so it fits cleanly
 * in a sidebar (desktop) or between feed sections (mobile) without burying urgent deadlines.
 */
export function QuickQuestions({ questions, className }: { questions: RankedQuestion[]; className?: string }) {
  const [index, setIndex] = useState(0);

  if (!questions.length) return null;

  const currentIndex = Math.min(index, questions.length - 1);
  const q = questions[currentIndex];

  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-2">
        <Kicker className="inline-flex items-center gap-1.5">
          <HelpCircle className="h-3.5 w-3.5 text-accent" aria-hidden />
          Quick question
        </Kicker>
        <span className="text-xs tabular-nums text-muted" aria-live="polite">
          {currentIndex + 1} of {questions.length}
        </span>
      </div>

      <div className="mt-1">
        <FactQuestion
          key={`${q.kind}:${q.key}`}
          q={q}
          source="feed"
          hint={`Personalizes ${q.itemCount} ${q.itemCount === 1 ? "item" : "items"} in your feed`}
        />
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <Link
          className="text-xs text-muted underline-offset-2 hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          href="/profile"
        >
          Manage answers
        </Link>
        {questions.length > 1 && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              className="!px-2 !py-1 text-xs"
              disabled={currentIndex === 0}
              onClick={() => setIndex(Math.max(0, currentIndex - 1))}
              aria-label="Previous question"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Prev
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="!px-2 !py-1 text-xs"
              disabled={currentIndex >= questions.length - 1}
              onClick={() => setIndex(Math.min(questions.length - 1, currentIndex + 1))}
              aria-label="Next question"
            >
              Skip <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
