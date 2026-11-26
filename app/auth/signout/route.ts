import { NextResponse, type NextRequest } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

export async function POST(request: NextRequest) {
  const redirect = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  const supabase = createRouteClient(request, redirect);
  await supabase.auth.signOut();
  return redirect;
}
