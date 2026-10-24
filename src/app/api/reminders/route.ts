import { NextResponse } from "next/server";
import { GRACE_MINUTES } from "@/lib/deadline";
import { markReminded, planReminders, sendReminders, sendTestReminder } from "@/lib/reminderJob";
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
    // ?test=1: a sample email to every admin, whatever the week. For checking the Resend setup.
    if (new URL(req.url).searchParams.get("test") === "1") {
      const { data: admins } = await sb.from("players").select("name,email").eq("is_admin", true).not("email", "is", null);
      const results = [];
      for (const a of admins ?? []) results.push(...(await sendTestReminder({ name: a.name, email: a.email }, new URL(req.url).origin, await grace(sb))));
      return NextResponse.json({ test: true, results });
    }
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

// Admin: { send?: boolean, test?: boolean }. Without either it's a preview of who would get one; `send` sends right now
// (this doesn't count as the week's scheduled reminder); `test` emails a sample to the signed-in admin.
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    const sb = adminClient();
    if (body.test) {
      const { data: me } = await sb.from("players").select("name,email").eq("id", admin.id).single();
      if (!me?.email) return NextResponse.json({ error: "Your player has no email." }, { status: 400 });
      return NextResponse.json({ test: true, results: await sendTestReminder({ name: me.name, email: me.email }, new URL(req.url).origin, await grace(sb)) });
    }
    const plan = await planReminders(sb);
    if (!plan) return NextResponse.json({ plan: null, message: "No open week." });
    if (!body.send) return NextResponse.json({ plan });
    const results = await sendReminders(plan, new URL(req.url).origin, await grace(sb));
    return NextResponse.json({ plan, results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
