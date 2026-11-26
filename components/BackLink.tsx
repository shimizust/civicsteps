"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cx } from "@/components/ui";

/**
 * Navigates back to the previous in-app screen when the visitor arrived from another route
 * (preserving browse search queries or feed level filters), falling back cleanly to `fallbackHref`.
 */
export function BackLink({
  fallbackHref,
  fallbackLabel,
  className,
}: {
  fallbackHref: string;
  fallbackLabel: string;
  className?: string;
}) {
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (typeof window === "undefined" || !document.referrer) return;
    try {
      const ref = new URL(document.referrer);
      const isAppRoute =
        ref.origin === window.location.origin &&
        ref.pathname !== window.location.pathname &&
        !ref.pathname.startsWith("/login") &&
        !ref.pathname.startsWith("/auth");
      if (isAppRoute && window.history.length > 1) {
        e.preventDefault();
        router.back();
      }
    } catch {
      // Ignore malformed referrer and follow fallbackHref
    }
  }

  return (
    <Link
      href={fallbackHref}
      onClick={handleClick}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md text-sm text-muted transition hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {fallbackLabel}
    </Link>
  );
}
