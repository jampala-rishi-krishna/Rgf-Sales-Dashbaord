import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/session.server";
import { getFlags } from "@/lib/flags.server";
import { getN8n } from "@/lib/n8n-actions.server";

export const Route = createFileRoute("/api/agent-health")({
  server: {
    handlers: {
      GET: async () => {
        if (!getFlags().agentEvents && !process.env.AGENT_HEALTH_ENABLED)
          return json({ connected: false });
        const r = await getN8n("/dashboard-agent-health");
        if (!r.ok) return json({ connected: false, error: r.error });
        return json(
          {
            connected: true,
            ...(r.data && typeof r.data === "object" ? r.data : { data: r.data }),
          },
          200,
          {
            "Cache-Control": "private, max-age=15",
          },
        );
      },
    },
  },
});
