import { NextResponse } from "next/server";
import { GRACE_MINUTES } from "@/lib/deadline";
import { markReminded, planReminders, sendReminders } from "@/lib/reminderJob";
import { adminClient, requireAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function grace(sb: ReturnType<typeof adminClient>) {
  const { data } = await sb.from("settings").select("value").eq("key", "grace_minutes").maybeSingle();
  return Number(data?.value ?? GRACE_MINUTES);
}

// Scheduled (Supabase timer, every 15 minutes): once per week, at the reminder time (default 60 minutes before picks
// are due), email everyone who hasn't locked. Marks the week so it never sends twice.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sb = adminClient();
    const plan = await planReminders(sb);
    if (!plan) return NextResponse.json({ sent: 0, message: "No open week." });
    if (!plan.remindAt) return NextResponse.json({ sent: 0, message: plan.remindedAt ? `${plan.label}: reminder already sent.` : `${plan.label}: not time yet.` });
    if (!process.env.RESEND_API_KEY)
      return NextResponse.json({ sent: 0, message: `${plan.label}: ${plan.recipients.length} to remind, but RESEND_API_KEY is not set.` }, { status: 500 });
    const results = plan.recipients.length ? await sendReminders(plan, new URL(req.url).origin, await grace(sb)) : [];
    await markReminded(sb, plan.weekId);
    return NextResponse.json({ sent: results.filter((r) => r.ok).length, results, message: `${plan.label}: reminded ${results.filter((r) => r.ok).length} of ${plan.recipients.length}.` });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Admin: { send?: boolean }. Without send it's a preview of who would get one; with it, sends right now
// (this doesn't count as the week's scheduled reminder).
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    const sb = adminClient();
    const plan = await planReminders(sb);
    if (!plan) return NextResponse.json({ plan: null, message: "No open week." });
    if (!body.send) return NextResponse.json({ plan });
    const results = await sendReminders(plan, new URL(req.url).origin, await grace(sb));
    return NextResponse.json({ plan, results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
