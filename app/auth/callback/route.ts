import { NextResponse, type NextRequest } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/feed";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/feed";

  if (code) {
    // Prefer the deployment host behind Vercel's proxy so cookies are set for the URL the user sees.
    const forwardedHost = request.headers.get("x-forwarded-host");
    const isLocal = process.env.NODE_ENV === "development";
    const redirectOrigin = !isLocal && forwardedHost ? `https://${forwardedHost}` : origin;
    const redirect = NextResponse.redirect(`${redirectOrigin}${next}`);

    const supabase = createRouteClient(request, redirect);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirect;
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
