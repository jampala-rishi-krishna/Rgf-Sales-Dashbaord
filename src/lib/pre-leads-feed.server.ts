// Server-only Pre-Leads feed with an in-memory cache. Never import from client code.
import { normalizePreLead, type PreLead, type PreLeadsResponse } from "@/lib/crm";
import { fetchAllPreLeads, n8nConfig, zohoConfigured } from "@/lib/zoho.server";

// The n8n feed pages through ~8k Zoho records and takes ~80s.
const N8N_TIMEOUT_MS = 120_000;
const FRESH_MS = 10 * 60_000;

/**
 * Drops the per-lead raw Zoho record (up to 50 fields) from the list: with ~8k leads
 * it made the response tens of MB.
 */
function slim(lead: PreLead): PreLead {
  return { ...lead, raw: {} };
}

async function viaN8n(): Promise<PreLeadsResponse | null> {
  const { base, headers } = n8nConfig();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/dashboard-pre-leads`, {
      headers,
      signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[pre-leads] n8n status=${res.status}`);
      return null;
    }
    const d = (await res.json()) as unknown;
    const rows = (
      Array.isArray(d)
        ? d
        : ((d as { leads?: unknown[]; data?: unknown[] }).leads ?? (d as { data?: unknown[] }).data)
    ) as Record<string, unknown>[] | undefined;
    if (!Array.isArray(rows)) return null;
    return {
      connected: true,
      source: "n8n",
      fetchedAt: new Date().toISOString(),
      leads: rows
        .map(normalizePreLead)
        .filter((l) => l.id)
        .map(slim),
    };
  } catch (err) {
    console.warn("[pre-leads] n8n error:", err);
    return null;
  }
}

async function viaZoho(): Promise<PreLeadsResponse | null> {
  if (!zohoConfigured()) return null;
  try {
    const leads = (await fetchAllPreLeads()).map(slim);
    return { connected: true, source: "zoho", fetchedAt: new Date().toISOString(), leads };
  } catch (err) {
    console.error("[pre-leads] zoho error:", err);
    return null;
  }
}

// Per-instance memory cache: fresh for 10 min, then served stale while one refresh
// runs in the background, so only the very first load waits.
let memo: { data: PreLeadsResponse; at: number } | null = null;
let inflight: Promise<PreLeadsResponse | null> | null = null;

function refresh(): Promise<PreLeadsResponse | null> {
  inflight ??= viaN8n()
    .then((d) => d ?? viaZoho())
    .then((d) => {
      if (d) memo = { data: d, at: Date.now() };
      return d;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Cached full feed (slimmed). null when neither n8n nor Zoho could be reached. */
export async function getPreLeadsFeed(): Promise<PreLeadsResponse | null> {
  if (memo) {
    if (Date.now() - memo.at > FRESH_MS) void refresh();
    return memo.data;
  }
  return refresh();
}

export function preLeadsSourceConfigured(): boolean {
  return !!n8nConfig().base || zohoConfigured();
}
