import { LoginForm } from "./LoginForm";
import { PageTitle } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <div className="mx-auto max-w-md">
      <PageTitle sub="We'll email you a sign-in link. No password needed.">Sign in</PageTitle>
      {error && <p className="mb-4 rounded-lg bg-cost-soft p-3 text-sm text-cost">That link didn&apos;t work or has expired. Try again.</p>}
      <LoginForm next={next?.startsWith("/") ? next : "/feed"} />
    </div>
  );
}
