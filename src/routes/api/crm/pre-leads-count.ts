import { createFileRoute } from "@tanstack/react-router";
import type { PreLeadsCount } from "@/lib/crm";
import { getPreLeadsFeed, preLeadsSourceConfigured } from "@/lib/pre-leads-feed.server";

const RECENT_MS = 15 * 86_400_000;

function json(body: PreLeadsCount, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

/**
 * Home-screen Pre-Leads counter: the total plus only the last ~15 days of created
 * timestamps (for "today" and the sparkline), instead of shipping ~8k leads to the browser.
 */
export const Route = createFileRoute("/api/crm/pre-leads-count")({
  server: {
    handlers: {
      GET: async () => {
        if (!preLeadsSourceConfigured()) return json({ connected: false, total: 0, recent: [] });
        const feed = await getPreLeadsFeed();
        if (!feed)
          return json(
            { connected: true, total: 0, recent: [], error: "Pre-Leads fetch failed" },
            502,
          );
        const cutoff = Date.now() - RECENT_MS;
        const recent = feed.leads
          .map((l) => l.createdTime)
          .filter((t) => !!t && Date.parse(t) >= cutoff);
        return json({
          connected: feed.connected,
          total: feed.leads.length,
          recent,
          fetchedAt: feed.fetchedAt,
        });
      },
    },
  },
});
