import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { normalizePreLead } from "@/lib/crm";
import { fetchPreLeadById, n8nConfig, zohoConfigured } from "@/lib/zoho.server";

const Query = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/) });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": status === 200 ? "s-maxage=120, stale-while-revalidate=600" : "no-store",
    },
  });
}

export const Route = createFileRoute("/api/crm/pre-lead")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const parsed = Query.safeParse({ id: new URL(request.url).searchParams.get("id") ?? "" });
        if (!parsed.success) return json({ ok: false, error: "Invalid id" }, 400);
        const { id } = parsed.data;
        try {
          if (zohoConfigured()) {
            const lead = await fetchPreLeadById(id);
            return lead
              ? json({ ok: true, connected: true, lead })
              : json({ ok: false, error: "Not found" }, 404);
          }
          const { base, headers } = n8nConfig();
          if (base) {
            // n8n "[DASHBOARD] Get Pre-Leads Feed" serves one lead on the same path via ?id=.
            const res = await fetch(`${base}/dashboard-pre-leads?id=${encodeURIComponent(id)}`, {
              headers,
              signal: AbortSignal.timeout(15_000),
            });
            if (res.ok) {
              const d = (await res.json()) as Record<string, unknown> | Record<string, unknown>[];
              const row = Array.isArray(d)
                ? d[0]
                : d.ok === false
                  ? undefined
                  : ((d.lead as Record<string, unknown>) ?? d);
              if (row) return json({ ok: true, connected: true, lead: normalizePreLead(row) });
            }
          }
          return json({ ok: false, connected: false, error: "CRM not connected" }, 404);
        } catch (err) {
          console.error("[crm/pre-lead] error:", err);
          return json({ ok: false, error: "CRM fetch failed" }, 502);
        }
      },
    },
  },
});
