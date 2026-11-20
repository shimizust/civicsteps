import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "CivicSteps",
  description: "Know what's being decided that affects you, and make your voice heard — from city hall to Congress.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <nav className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-1 px-4 py-3 text-sm">
            <Link href={user ? "/feed" : "/"} className="mr-auto font-display text-lg font-semibold">
              Civic<span className="text-accent">Steps</span>
            </Link>
            {user ? (
              <>
                <NavLink href="/feed">Feed</NavLink>
                <NavLink href="/reps">My reps</NavLink>
                <NavLink href="/profile">Profile</NavLink>
              </>
            ) : (
              <NavLink href="/login">Sign in</NavLink>
            )}
          </div>
        </nav>
        <main className="mx-auto max-w-4xl px-4 py-6 sm:py-10">{children}</main>
        <footer className="mx-auto max-w-4xl px-4 pb-10 text-xs text-muted">
          Nonpartisan and open source. Data from Congress.gov, the Federal Register, Open States, Legistar and the U.S. Census.
          Summaries are AI-generated — check the source before acting.
        </footer>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-md px-3 py-1.5 text-muted hover:bg-accent-soft hover:text-accent">
      {children}
    </Link>
  );
}
