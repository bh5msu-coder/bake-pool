import { NextResponse } from "next/server";
import { userClient } from "@/lib/supabase/server";

// The emailed sign-in link lands here; trade its one-time code for a session cookie.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await (await userClient()).auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(`/?login_error=${encodeURIComponent(error.message)}`, url.origin));
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
