import { NextResponse } from "next/server";
import { adminClient, requireAdmin } from "@/lib/supabase/server";
import { publicSheet } from "@/lib/sheet";
import { importHistory } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  try {
    const report = await importHistory(adminClient(), publicSheet(process.env.SHEET_ID ?? ""));
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
