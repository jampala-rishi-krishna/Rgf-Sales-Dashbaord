import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/session.server";
import { getFlags } from "@/lib/flags.server";
import { getN8n } from "@/lib/n8n-actions.server";

export const Route = createFileRoute("/api/campaign-runs")({
  server: {
    handlers: {
      GET: async () => {
        if (!getFlags().campaignRuns) return json({ connected: false, runs: [] });
        const r = await getN8n("/dashboard-campaign-runs");
        if (!r.ok) return json({ connected: false, runs: [], error: r.error });
        const d = r.data as unknown;
        const runs = Array.isArray(d) ? d : ((d as { runs?: unknown[] } | null)?.runs ?? []);
        return json({ connected: true, runs });
      },
    },
  },
});
