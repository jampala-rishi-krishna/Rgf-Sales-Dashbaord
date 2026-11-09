import { createFileRoute } from "@tanstack/react-router";
import type { PreLeadsResponse } from "@/lib/crm";
import { getPreLeadsFeed, preLeadsSourceConfigured } from "@/lib/pre-leads-feed.server";

// Never CDN-cache (s-maxage): Vercel's CDN would serve lead data to requests that
// never reach the session check. Caching happens in server memory instead.
function json(body: PreLeadsResponse, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

export const Route = createFileRoute("/api/crm/pre-leads")({
  server: {
    handlers: {
      GET: async () => {
        if (!preLeadsSourceConfigured()) return json({ connected: false, leads: [] });
        const feed = await getPreLeadsFeed();
        if (feed) return json(feed);
        return json({ connected: true, leads: [], error: "Pre-Leads fetch failed" }, 502);
      },
    },
  },
});
