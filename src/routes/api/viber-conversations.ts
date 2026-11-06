import { createFileRoute } from "@tanstack/react-router";

const NOT_CONNECTED = JSON.stringify({ connected: false, conversations: [] });
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

export const Route = createFileRoute("/api/viber-conversations")({
  server: {
    handlers: {
      GET: async () => {
        const base = process.env.N8N_WEBHOOK_BASE_URL;
        if (!base) return new Response(NOT_CONNECTED, { status: 200, headers });
        try {
          const res = await fetch(`${base}/lead-gen-viber-conversations`);
          console.log(`[viber-conversations] status=${res.status}`);
          if (!res.ok) return new Response(NOT_CONNECTED, { status: 200, headers });
          const body = await res.text();
          try {
            JSON.parse(body);
          } catch {
            return new Response(NOT_CONNECTED, { status: 200, headers });
          }
          return new Response(body, { status: 200, headers });
        } catch (err) {
          console.error("[viber-conversations] fetch error:", err);
          return new Response(NOT_CONNECTED, { status: 200, headers });
        }
      },
    },
  },
});
