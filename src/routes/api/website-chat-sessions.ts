import { createFileRoute } from "@tanstack/react-router";

const N8N_WEBHOOK_URL = "https://rareglobalfood.app.n8n.cloud/webhook/martin-chat-dashboard-sessions";

export const Route = createFileRoute("/api/website-chat-sessions")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const res = await fetch(N8N_WEBHOOK_URL, {
            headers: { "Cache-Control": "no-cache" },
          });
          const body = await res.text();
          return new Response(body, {
            status: res.status,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        } catch (err) {
          console.error("[website-chat-sessions] error:", err);
          return new Response(JSON.stringify({ error: "Failed to fetch website chat sessions" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
