import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Acts as the signed-in user (RLS applies). */
export async function userClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
}

/** Bypasses RLS. Server-only: used by the lines sync and the history import. */
export function adminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set. Add it to .env.local (and to Vercel).");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}

/** The signed-in player if they're an admin, else null. */
export async function requireAdmin() {
  const sb = await userClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return null;
  const { data } = await sb.from("players").select("id,is_admin").ilike("email", user.email).maybeSingle();
  return data?.is_admin ? data : null;
}
