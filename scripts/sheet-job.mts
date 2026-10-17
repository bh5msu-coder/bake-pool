// Runs the lines sync from the command line, reading the sheet either from Google
// (public link) or from a folder of CSV exports (one file per tab).
//
//   npm run sheet -- lines [--csv <dir>] [--apply]
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseCsv, publicSheet, type TabReader } from "../src/lib/sheet";
import { applyLinesSync, planLinesSync } from "../src/lib/sync";

const [cmd, ...rest] = process.argv.slice(2);
const csv = rest.includes("--csv") ? rest[rest.indexOf("--csv") + 1] : null;
const read: TabReader = csv
  ? async (tab) => parseCsv(readFileSync(path.join(csv, `${tab}.csv`), "utf8"))
  : publicSheet(process.env.SHEET_ID ?? "");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.local).");
const sb = createClient(url, key, { auth: { persistSession: false } });

if (cmd === "lines") {
  const plan = await planLinesSync(sb, read);
  console.log(`${plan.action}: ${plan.message}`);
  for (const g of plan.games.filter((x) => x.problem)) console.log(`  ! G${g.num} ${g.away} at ${g.home}: ${g.problem}`);
  if ("changes" in plan) for (const c of plan.changes) console.log(`  G${c.num}: ${c.from} -> ${c.to}`);
  if (rest.includes("--apply") && (plan.action === "create" || plan.action === "update")) {
    await applyLinesSync(sb, plan);
    console.log("applied");
  }
} else {
  console.log("Usage: npm run sheet -- lines [--csv <dir>] [--apply]");
}
