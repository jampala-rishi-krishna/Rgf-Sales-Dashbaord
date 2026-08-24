import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/vapi-recording")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
        const url = new URL(request.url);
        const callId = url.searchParams.get("callId");
        const type = url.searchParams.get("type") ?? "stereo"; // "mono" | "stereo"

        if (!VAPI_PRIVATE_KEY) {
          return new Response(JSON.stringify({ error: "Vapi credentials not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!callId) {
          return new Response(JSON.stringify({ error: "Missing callId" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const endpoint = type === "mono" ? "mono-recording" : "stereo-recording";

        try {
          const vapiRes = await fetch(`https://api.vapi.ai/call/${callId}/${endpoint}`, {
            headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}` },
            redirect: "follow",
          });

          if (!vapiRes.ok) {
            return new Response(
              JSON.stringify({ error: `Vapi recording fetch failed: ${vapiRes.status}` }),
              { status: vapiRes.status, headers: { "Content-Type": "application/json" } },
            );
          }

          const contentType = vapiRes.headers.get("content-type") ?? "audio/wav";
          const buffer = await vapiRes.arrayBuffer();

          return new Response(buffer, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "private, max-age=3600",
            },
          });
        } catch (err) {
          console.error("[vapi-recording] error:", err);
          return new Response(JSON.stringify({ error: "Failed to fetch recording" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
