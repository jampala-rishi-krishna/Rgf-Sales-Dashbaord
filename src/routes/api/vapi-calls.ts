import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/vapi-calls")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
        const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
        if (!VAPI_PRIVATE_KEY || !ASSISTANT_ID) {
          return new Response(JSON.stringify({ error: "Vapi credentials not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const url = new URL(request.url);
        const limit = url.searchParams.get("limit") ?? "100";
        const target = `https://api.vapi.ai/call?assistantId=${ASSISTANT_ID}&limit=${limit}`;
        const res = await fetch(target, {
          headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}` },
        });
        const body = await res.text();
        console.log(`[vapi-calls] status=${res.status} bodyLength=${body.length}`);
        return new Response(body, {
          status: res.status,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
