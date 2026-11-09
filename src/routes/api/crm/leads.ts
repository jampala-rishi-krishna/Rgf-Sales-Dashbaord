import { createFileRoute } from "@tanstack/react-router";
import type { LeadsResponse } from "@/lib/leads";
import { getFlags } from "@/lib/flags.server";
import { EMPTY_LEADS, getLeadsFeed, leadsSourceConfigured } from "@/lib/leads-feed.server";

// Never CDN-cache (no s-maxage): Vercel's CDN would serve lead data to requests that
// never reach the session check. Caching happens in server memory instead (5 min).
function json(body: LeadsResponse, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

export const Route = createFileRoute("/api/crm/leads")({
  server: {
    handlers: {
      GET: async () => {
        const flags = getFlags();
        if (!flags.leadsTab && !flags.leadConversion) return json(EMPTY_LEADS);
        if (!leadsSourceConfigured())
          return json({ ...EMPTY_LEADS, error: "N8N_BASE is not configured" });
        const feed = await getLeadsFeed();
        return json(feed, feed.ok ? 200 : 502);
      },
    },
  },
});
