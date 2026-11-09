// Server-only Zoho Leads feed (via n8n GET /dashboard-leads) with an in-memory cache.
// Never import from client code.
import type { ConvertChannel } from "@/lib/conversion";
import type { LeadConversion, LeadField, LeadRecord, LeadsResponse } from "@/lib/leads";
import { n8nErrorMessage } from "@/lib/n8n-actions.server";
import { n8nConfig } from "@/lib/zoho.server";

const N8N_TIMEOUT_MS = 60_000;
const FRESH_MS = 5 * 60_000;
const CHANNELS: ConvertChannel[] = ["whatsapp", "sms", "viber", "email", "voice", "web"];

export const EMPTY_LEADS: LeadsResponse = {
  ok: true,
  connected: false,
  count: 0,
  fields: [],
  leads: [],
  conversions: [],
};

const str = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object" && "name" in (v as object)) return str((v as { name: unknown }).name);
  return undefined;
};

/** Flattens Zoho lookups ({name,id}) and keeps every other field as-is. */
export function normalizeLead(r: Record<string, unknown>): LeadRecord {
  const owner = r.Owner;
  const ownerId =
    str(r.Owner_id) ??
    (owner && typeof owner === "object" ? str((owner as { id?: unknown }).id) : undefined);
  return {
    ...r,
    id: String(r.id ?? r.ID ?? ""),
    First_Name: str(r.First_Name),
    Last_Name: str(r.Last_Name),
    Company: str(r.Company),
    Phone: str(r.Phone),
    Mobile: str(r.Mobile),
    Email: str(r.Email)?.toLowerCase(),
    Lead_Source: str(r.Lead_Source),
    Lead_Status: str(r.Lead_Status),
    Owner: str(owner),
    Owner_id: ownerId,
    Created_Time: str(r.Created_Time),
    Modified_Time: str(r.Modified_Time),
    Description: str(r.Description),
  };
}

function normalizeConversion(r: Record<string, unknown>): LeadConversion | null {
  const leadId = str(r.leadId);
  const convertedAt = str(r.convertedAt);
  if (!leadId || !convertedAt) return null;
  const chans = Array.isArray(r.repliedChannels)
    ? r.repliedChannels
    : typeof r.repliedChannels === "string"
      ? r.repliedChannels.split(/[;,]/)
      : [];
  return {
    leadId,
    preLeadId: str(r.preLeadId) ?? "",
    convertedAt,
    convertedBy: str(r.convertedBy),
    repliedChannels: chans
      .map((c) => String(c).trim().toLowerCase())
      .filter((c): c is ConvertChannel => (CHANNELS as string[]).includes(c)),
    firstContactAt: str(r.firstContactAt),
    firstReplyAt: str(r.firstReplyAt),
  };
}

/** Normalizes the n8n payload (object or bare array of leads) into LeadsResponse. */
export function normalizeLeadsPayload(d: unknown): LeadsResponse | null {
  const body = (Array.isArray(d) ? { leads: d } : d) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return null;
  const rows = (body.leads ?? body.data) as unknown;
  if (!Array.isArray(rows)) return null;
  const leads = (rows as Record<string, unknown>[]).map(normalizeLead).filter((l) => l.id);
  const fields = (Array.isArray(body.fields) ? body.fields : [])
    .map((f) => f as Record<string, unknown>)
    .filter((f) => typeof f.apiName === "string")
    .map((f) => ({
      apiName: String(f.apiName),
      label: str(f.label) ?? String(f.apiName),
      type: str(f.type) ?? "text",
    })) as LeadField[];
  const conversions = (Array.isArray(body.conversions) ? body.conversions : [])
    .map((c) => normalizeConversion(c as Record<string, unknown>))
    .filter((c): c is LeadConversion => !!c);
  return {
    ok: true,
    connected: true,
    count: leads.length,
    fetchedAt: str(body.fetchedAt) ?? new Date().toISOString(),
    fields,
    leads,
    conversions,
  };
}

async function viaN8n(): Promise<LeadsResponse> {
  const { base, headers } = n8nConfig();
  if (!base) return { ...EMPTY_LEADS, error: "N8N_BASE is not configured" };
  try {
    const res = await fetch(`${base}/dashboard-leads`, {
      headers: { ...headers, Accept: "application/json" },
      signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
    });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* plain text */
    }
    if (!res.ok) {
      console.warn(`[leads] n8n status=${res.status}`);
      return {
        ...EMPTY_LEADS,
        ok: res.status === 404,
        error: n8nErrorMessage(res.status, data),
      };
    }
    const out = normalizeLeadsPayload(data);
    if (!out)
      return { ...EMPTY_LEADS, ok: false, connected: true, error: "Unexpected n8n response" };
    return out;
  } catch (err) {
    console.warn("[leads] n8n error:", err);
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      ...EMPTY_LEADS,
      ok: false,
      connected: true,
      error: timedOut ? "n8n timed out after 60s" : "Could not reach n8n",
    };
  }
}

// Per-instance memory cache: fresh for 5 min, then served stale while one refresh runs.
let memo: { data: LeadsResponse; at: number } | null = null;
let inflight: Promise<LeadsResponse> | null = null;

function refresh(): Promise<LeadsResponse> {
  inflight ??= viaN8n()
    .then((d) => {
      // Only cache usable data; failures are retried on the next request.
      if (d.ok && d.connected) memo = { data: d, at: Date.now() };
      return d;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function getLeadsFeed(): Promise<LeadsResponse> {
  if (memo) {
    if (Date.now() - memo.at > FRESH_MS) void refresh();
    return memo.data;
  }
  return refresh();
}

/** Drops the cache (e.g. right after a conversion so the next read includes it). */
export function invalidateLeadsFeed(): void {
  memo = null;
}

export function leadsSourceConfigured(): boolean {
  return !!n8nConfig().base;
}

/** Test helper. */
export function __resetLeadsCache(): void {
  memo = null;
  inflight = null;
}
