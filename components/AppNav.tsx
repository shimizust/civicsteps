"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Newspaper, User, Users } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { cx } from "@/components/ui";

const NAV_ITEMS = [
  { href: "/feed", label: "Feed", mobileLabel: "Feed", Icon: Newspaper, match: (p: string) => p === "/feed" },
  { href: "/browse", label: "Browse", mobileLabel: "Browse", Icon: Compass, match: (p: string) => p === "/browse" },
  { href: "/reps", label: "My reps", mobileLabel: "Reps", Icon: Users, match: (p: string) => p.startsWith("/reps") },
  { href: "/profile", label: "Profile", mobileLabel: "Profile", Icon: User, match: (p: string) => p === "/profile" },
] as const;

export function AppNav({ signedIn, children }: { signedIn: boolean; children?: ReactNode }) {
  const pathname = usePathname() || "/";

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:not-sr-only focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white dark:focus:text-paper"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 text-sm">
          <Link
            href={signedIn ? "/feed" : "/"}
            className="mr-auto inline-flex items-center gap-2 rounded-md font-display text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <LogoMark className="h-6 w-6 shrink-0 text-accent" />
            <span>
              Civic<span className="text-accent">Steps</span>
            </span>
          </Link>

          {signedIn ? (
            <nav aria-label="Primary" className="hidden items-center gap-1 sm:flex">
              {NAV_ITEMS.map(({ href, label, match }) => {
                const active = match(pathname);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "rounded-md px-3 py-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-accent-soft/60 hover:text-ink",
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          ) : (
            <nav aria-label="Account">
              <Link
                href="/login"
                className={cx(
                  "rounded-md px-3 py-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  pathname === "/login" ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-accent-soft hover:text-accent",
                )}
              >
                Sign in
              </Link>
            </nav>
          )}
          {children}
        </div>
      </header>

      {signedIn && (
        <nav
          aria-label="Mobile navigation"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
        >
          <ul className="mx-auto grid max-w-md grid-cols-4">
            {NAV_ITEMS.map(({ href, mobileLabel, Icon, match }) => {
              const active = match(pathname);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "relative flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
                      active ? "text-accent" : "text-muted hover:text-ink",
                    )}
                  >
                    {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" aria-hidden />}
                    <Icon className="h-5 w-5" aria-hidden />
                    <span>{mobileLabel}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </>
  );
}
