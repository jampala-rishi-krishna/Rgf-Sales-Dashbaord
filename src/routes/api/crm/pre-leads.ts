import { createFileRoute } from "@tanstack/react-router";
import { normalizePreLead, type PreLeadsResponse } from "@/lib/crm";
import { fetchAllPreLeads, n8nConfig, zohoConfigured } from "@/lib/zoho.server";

// Never CDN-cache (s-maxage): Vercel's CDN would serve lead data to requests that
// never reach the session check. Caching happens in server memory instead (below).
const CACHE = "private, no-store";
// The n8n feed pages through ~8k Zoho records and takes ~80s.
const N8N_TIMEOUT_MS = 120_000;
const FRESH_MS = 10 * 60_000;

function json(body: PreLeadsResponse, status = 200, cache = CACHE) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": cache },
  });
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
      console.warn(`[crm/pre-leads] n8n status=${res.status}`);
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
      leads: rows.map(normalizePreLead).filter((l) => l.id),
    };
  } catch (err) {
    console.warn("[crm/pre-leads] n8n error:", err);
    return null;
  }
}

// Per-instance memory cache: fresh for 10 min, then served stale while one refresh
// runs in the background, so only the very first load waits for n8n.
let memo: { data: PreLeadsResponse; at: number } | null = null;
let inflight: Promise<PreLeadsResponse | null> | null = null;

function refresh(): Promise<PreLeadsResponse | null> {
  inflight ??= viaN8n()
    .then((d) => {
      if (d) memo = { data: d, at: Date.now() };
      return d;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function getCachedFeed(): Promise<PreLeadsResponse | null> {
  if (memo) {
    if (Date.now() - memo.at > FRESH_MS) void refresh();
    return memo.data;
  }
  return refresh();
}

export const Route = createFileRoute("/api/crm/pre-leads")({
  server: {
    handlers: {
      GET: async () => {
        const cached = await getCachedFeed();
        if (cached) return json(cached);
        if (zohoConfigured()) {
          try {
            const leads = await fetchAllPreLeads();
            return json({
              connected: true,
              source: "zoho",
              fetchedAt: new Date().toISOString(),
              leads,
            });
          } catch (err) {
            console.error("[crm/pre-leads] zoho error:", err);
            return json(
              { connected: true, leads: [], error: "Zoho CRM fetch failed" },
              502,
              "no-store",
            );
          }
        }
        return json({ connected: false, leads: [] });
      },
    },
  },
});
