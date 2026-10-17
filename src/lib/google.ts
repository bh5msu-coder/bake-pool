import "server-only";
// Minimal Google Sheets client for a service account ("robot account").
// Signs its own JWT with Node's crypto, so no Google SDK is needed.
import { createSign } from "node:crypto";
import type { CellWrite } from "./sheetWrite";
import type { Grid, TabReader } from "./sheet";

interface Key { client_email: string; private_key: string }

/** GOOGLE_SERVICE_ACCOUNT_KEY holds the JSON key file Google gives you (raw JSON or base64 of it). */
export function serviceAccount(): Key | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) return null;
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const k = JSON.parse(json) as Key;
  if (!k.client_email || !k.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is missing client_email or private_key.");
  return { client_email: k.client_email, private_key: k.private_key.replace(/\\n/g, "\n") };
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

async function accessToken(key: Key): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: key.client_email, scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const sig = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(key.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${b64url(sig)}` }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google sign-in failed: ${json.error_description ?? json.error ?? res.status}`);
  return json.access_token as string;
}

export interface SheetsClient { read: TabReader; write(updates: CellWrite[]): Promise<number>; email: string }

export async function sheetsClient(sheetId: string): Promise<SheetsClient> {
  const key = serviceAccount();
  if (!key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set, so the app can't write to the sheet.");
  const token = await accessToken(key);
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}`;
  const auth = { authorization: `Bearer ${token}` };
  const explain = (status: number, msg: string) =>
    status === 403 || status === 404
      ? `The robot account (${key.client_email}) can't open the sheet. Share the sheet with that email as an Editor.`
      : `Google Sheets error ${status}: ${msg}`;

  return {
    email: key.client_email,
    async read(tab) {
      const res = await fetch(`${base}/values/${encodeURIComponent(`${tab}!A1:AJ700`)}?valueRenderOption=FORMATTED_VALUE`, { headers: auth, cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(explain(res.status, json.error?.message ?? ""));
      return ((json.values ?? []) as unknown[][]).map((r) => r.map((c) => String(c ?? ""))) as Grid;
    },
    async write(updates) {
      if (!updates.length) return 0;
      const res = await fetch(`${base}/values:batchUpdate`, {
        method: "POST", headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: updates }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(explain(res.status, json.error?.message ?? ""));
      return Number(json.totalUpdatedCells ?? 0);
    },
  };
}
