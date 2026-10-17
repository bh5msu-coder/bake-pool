import { NextResponse } from "next/server";
import { adminClient, requireAdmin } from "@/lib/supabase/server";
import { publicSheet } from "@/lib/sheet";
import { pushDue } from "@/lib/push";
import { applyLinesSync, planLinesSync } from "@/lib/sync";

export const dynamic = "force-dynamic";

const sheet = () => {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error("SHEET_ID is not set.");
  return publicSheet(id);
};

// Vercel Cron: pull the Converter tab and apply safe changes (new week, moved lines). Never replaces an open week.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = adminClient();
    const plan = await planLinesSync(sb, sheet());
    if (plan.action === "create" || plan.action === "update") await applyLinesSync(sb, plan);
    // Safety net for the deadline write, and picks up results entered since.
    const pushed = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
      ? await pushDue(sb, process.env.SHEET_ID!).catch((e: Error) => ({ error: e.message }))
      : "skipped (no Google key)";
    return NextResponse.json({ action: plan.action, message: plan.message, pushed });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Admin "Refresh lines": { apply?: boolean, replace?: boolean }. Without apply it's a preview.
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    const sb = adminClient();
    const plan = await planLinesSync(sb, sheet());
    if (body.apply) await applyLinesSync(sb, plan, { replace: !!body.replace });
    return NextResponse.json({ plan, applied: !!body.apply });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
