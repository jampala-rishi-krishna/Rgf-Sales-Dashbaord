import { createFileRoute } from "@tanstack/react-router";
import { normalizePreLead, type PreLeadsResponse } from "@/lib/crm";
import { fetchAllPreLeads, n8nConfig, zohoConfigured } from "@/lib/zoho.server";

const CACHE = "s-maxage=600, stale-while-revalidate=1800";

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
      signal: AbortSignal.timeout(25_000),
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

export const Route = createFileRoute("/api/crm/pre-leads")({
  server: {
    handlers: {
      GET: async () => {
        const n8n = await viaN8n();
        if (n8n) return json(n8n);
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
        return json({ connected: false, leads: [] }, 200, "s-maxage=60");
      },
    },
  },
});
