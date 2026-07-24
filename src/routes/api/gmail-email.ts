import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/gmail-email")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const to = url.searchParams.get("to");
        if (!to) {
          return new Response(JSON.stringify({ error: "Missing ?to= param" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const n8nUrl = `${process.env.N8N_WEBHOOK_BASE_URL}/fetch-sent-email?to=${encodeURIComponent(to)}`;

        try {
          const res = await fetch(n8nUrl);
          const body = await res.text();
          console.log(`[gmail-email] to=${to} status=${res.status}`);
          return new Response(body, {
            status: res.status,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          });
        } catch (err) {
          console.error("[gmail-email] fetch error:", err);
          return new Response(JSON.stringify({ error: "Failed to fetch email" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
