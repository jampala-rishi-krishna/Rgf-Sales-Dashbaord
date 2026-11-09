// Server-only Zoho CRM helpers (self-client refresh-token flow). Never import from client code.
import { normalizePreLead, type PreLead } from "@/lib/crm";

const PRE_LEAD_FIELDS = [
  "First_Name",
  "Last_Name",
  "Name",
  "Lead_Phone",
  "Associated_Products",
  "Channel",
  "Created_Time",
  "Modified_Time",
  "Owner",
];

function env() {
  return {
    clientId: process.env.ZOHO_CLIENT_ID,
    clientSecret: process.env.ZOHO_CLIENT_SECRET,
    refreshToken: process.env.ZOHO_REFRESH_TOKEN,
    apiDomain: (process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.com").replace(/\/$/, ""),
    accountsDomain: (process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.com").replace(
      /\/$/,
      "",
    ),
  };
}

export function zohoConfigured() {
  const e = env();
  return !!(e.clientId && e.clientSecret && e.refreshToken);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getZohoAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const e = env();
  const res = await fetch(`${e.accountsDomain}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: e.clientId!,
      client_secret: e.clientSecret!,
      refresh_token: e.refreshToken!,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !data.access_token)
    throw new Error(`Zoho token refresh failed: ${res.status} ${data.error ?? ""}`);
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

type ZohoList = {
  data?: Record<string, unknown>[];
  info?: { more_records?: boolean; next_page_token?: string };
};

async function zohoGet(path: string): Promise<{ status: number; json: ZohoList }> {
  const token = await getZohoAccessToken();
  const res = await fetch(`${env().apiDomain}${path}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 204) return { status: 204, json: { data: [] } };
  if (!res.ok) throw new Error(`Zoho ${path.split("?")[0]} failed: ${res.status}`);
  return { status: res.status, json: (await res.json()) as ZohoList };
}

/** Paginate all Pre_Leads (per_page=200, page_token). Hard cap 100 pages (20k rows). */
export async function fetchAllPreLeads(): Promise<PreLead[]> {
  const out: PreLead[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 100; i++) {
    const qs = new URLSearchParams({ per_page: "200", fields: PRE_LEAD_FIELDS.join(",") });
    if (pageToken) qs.set("page_token", pageToken);
    const { json } = await zohoGet(`/crm/v8/Pre_Leads?${qs}`);
    for (const r of (json.data ?? []) as Record<string, unknown>[]) out.push(normalizePreLead(r));
    const info = json.info ?? {};
    if (!info.more_records || !info.next_page_token) break;
    pageToken = info.next_page_token;
  }
  return out;
}

/** n8n base + auth helper shared by the CRM routes. */
export function n8nConfig() {
  const base = (process.env.N8N_BASE || process.env.N8N_WEBHOOK_BASE_URL || "").replace(/\/$/, "");
  const headers: Record<string, string> = {};
  if (process.env.N8N_WEBHOOK_AUTH) headers.Authorization = process.env.N8N_WEBHOOK_AUTH;
  return { base, headers };
}
