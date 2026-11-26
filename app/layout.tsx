import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
import { cx } from "@/components/ui";
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
  const signedIn = !!user;

  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <AppNav signedIn={signedIn} />
        <main id="main-content" className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
          {children}
        </main>
        <footer className={cx("mx-auto max-w-5xl px-4 text-xs text-muted", signedIn ? "pb-24 sm:pb-10" : "pb-10")}>
          Nonpartisan and open source. Data from Congress.gov, the Federal Register, Open States, Legistar and the U.S. Census.
          Summaries are AI-generated — check the source before acting.
        </footer>
      </body>
    </html>
  );
}
